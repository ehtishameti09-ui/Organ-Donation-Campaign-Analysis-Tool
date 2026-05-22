<?php

namespace App\Http\Controllers;

use App\Models\Document;
use App\Models\Notification;
use App\Models\User;
use App\Services\ActivityLogger;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;

class DocumentController extends Controller
{
    /**
     * POST /api/documents/upload — multi-file upload
     * Accepts: files[] + document_type (CSV) + optional user_id (admin uploading on behalf)
     */
    public function upload(Request $request): JsonResponse
    {
        $data = $request->validate([
            'files' => ['required', 'array', 'min:1', 'max:10'],
            'files.*' => ['required', 'file', 'max:10240', 'mimes:jpg,jpeg,png,webp,gif,pdf'], // 10 MB
            'document_type' => ['required', 'string', 'max:60'],
            'user_id' => ['nullable', 'integer', 'exists:users,id'],
        ]);

        $authUser = $request->user();
        $targetUserId = $data['user_id'] ?? $authUser->id;

        // Permission check: can only upload for self or if admin/hospital
        if ($targetUserId !== $authUser->id && !$authUser->isAdmin() && !$authUser->isHospital()) {
            return response()->json(['message' => 'Cannot upload documents for another user.'], 403);
        }

        // A document type is single-slot: re-uploading a "Healthcare License"
        // replaces the previous one rather than stacking duplicates. Remove the
        // old files (storage + rows) for this user/type before saving the new set.
        $previous = Document::where('user_id', $targetUserId)
            ->where('document_type', $data['document_type'])
            ->get();
        foreach ($previous as $old) {
            Storage::disk('local')->delete($old->file_path);
            $old->delete();
        }

        $saved = [];
        foreach ($data['files'] as $file) {
            $path = $file->store('documents/'.$targetUserId, 'local'); // private disk
            $doc = Document::create([
                'user_id' => $targetUserId,
                'document_type' => $data['document_type'],
                'original_name' => $file->getClientOriginalName(),
                'file_path' => $path,
                'mime_type' => $file->getMimeType(),
                'size' => $file->getSize(),
                'status' => 'pending',
            ]);
            $saved[] = $doc;
        }

        ActivityLogger::logAction($targetUserId, 'documents_uploaded', count($saved).' document(s) uploaded', [
            'document_type' => $data['document_type'],
            'count' => count($saved),
        ]);

        // If a hospital (re)uploaded its registration documents, invalidate the
        // cached hospitals overview so the super admin sees the new files at once
        // (otherwise they stay hidden for up to the 30s cache TTL).
        $targetUser = $targetUserId === $authUser->id ? $authUser : User::find($targetUserId);
        if ($targetUser && $targetUser->role === 'hospital') {
            Cache::forget('hospitals:overview:v1');
        }

        return response()->json([
            'message' => count($saved).' document(s) uploaded.',
            'documents' => $saved,
        ], 201);
    }

    /** GET /api/documents — list documents (own, or scoped) */
    public function index(Request $request): JsonResponse
    {
        $authUser = $request->user();
        $query = Document::query();

        if ($userId = $request->query('user_id')) {
            $this->authorizeAccess($authUser, (int) $userId);
            $query->where('user_id', $userId);
        } else {
            $query->where('user_id', $authUser->id);
        }
        if ($type = $request->query('document_type')) {
            $query->where('document_type', $type);
        }

        return response()->json(['documents' => $query->orderByDesc('created_at')->get()]);
    }

    /** GET /api/documents/{document}/download — secure download */
    public function download(Request $request, Document $document)
    {
        $this->authorizeAccess($request->user(), $document->user_id);

        if (!Storage::disk('local')->exists($document->file_path)) {
            return response()->json(['message' => 'File missing on server.'], 404);
        }

        return Storage::disk('local')->download($document->file_path, $document->original_name);
    }

    /** DELETE /api/documents/{document} */
    public function destroy(Request $request, Document $document): JsonResponse
    {
        $authUser = $request->user();
        if ($document->user_id !== $authUser->id && !$authUser->isAdmin()) {
            return response()->json(['message' => 'Cannot delete this document.'], 403);
        }

        Storage::disk('local')->delete($document->file_path);
        $document->delete();
        return response()->json(['message' => 'Document deleted.']);
    }

    /** POST /api/documents/{document}/review — approve/reject a document */
    public function review(Request $request, Document $document): JsonResponse
    {
        $authUser = $request->user();
        if (!$authUser->isAdmin() && !$authUser->isHospital()) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }
        $data = $request->validate([
            'status' => ['required', 'in:approved,rejected'],
            'notes' => ['nullable', 'string'],
        ]);
        $document->update([
            'status' => $data['status'],
            'reviewed_by' => $authUser->id,
            'reviewed_at' => now(),
            'review_notes' => $data['notes'] ?? null,
        ]);

        // Notify the document owner of the review outcome so they can act on it.
        $label = ucwords(trim(preg_replace('/(?<!^)[A-Z]/', ' $0', (string) $document->document_type)));
        $label = $label !== '' ? $label : 'document';
        if ($data['status'] === 'rejected') {
            Notification::create([
                'user_id' => $document->user_id,
                'type' => 'warning',
                'title' => 'Document rejected: '.$label,
                'message' => 'Your "'.$label.'" was rejected'
                    .(!empty($data['notes']) ? ' — '.$data['notes'] : '')
                    .'. Please upload a corrected copy from Account Settings → Documents for re-review.',
                'data' => ['document_id' => $document->id, 'document_type' => $document->document_type, 'reason' => $data['notes'] ?? null],
            ]);
            ActivityLogger::logAction($document->user_id, 'document_rejected', 'Document rejected: '.$label, ['document_id' => $document->id, 'reason' => $data['notes'] ?? null], $authUser->id);
        } else {
            Notification::create([
                'user_id' => $document->user_id,
                'type' => 'info',
                'title' => 'Document approved: '.$label,
                'message' => 'Your "'.$label.'" was approved.',
                'data' => ['document_id' => $document->id, 'document_type' => $document->document_type],
            ]);
        }

        // Owner's overview/dashboard caches may show document status — refresh them.
        Cache::forget('hospitals:overview:v1');

        return response()->json(['message' => 'Document '.$data['status'].'.']);
    }

    private function authorizeAccess(User $user, int $ownerId): void
    {
        if ($user->id === $ownerId) return;
        if ($user->isAdmin()) return;

        if ($user->isHospital()) {
            $owner = User::find($ownerId);
            if ($owner && $owner->preferred_hospital_id === $user->id) return;
        }

        abort(403, 'You do not have access to this document.');
    }
}
