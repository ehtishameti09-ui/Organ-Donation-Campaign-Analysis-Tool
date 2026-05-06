<?php

return [

    'driver' => env('HASH_DRIVER', 'argon2id'),

    'bcrypt' => [
        'rounds' => env('BCRYPT_ROUNDS', 12),
        'verify' => true,
        'limit' => null,
    ],

    'argon' => [
        'memory' => env('HASH_ARGON_MEMORY', 65536),
        'threads' => env('HASH_ARGON_THREADS', 2),
        'time' => env('HASH_ARGON_TIME', 4),
        'verify' => true,
    ],

    'rehash_on_login' => true,
];
