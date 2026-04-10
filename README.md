# ODCAT - Organ Donation Campaign Analysis Tool

React application featuring Login Module, Dashboard, and Super Admin User Management.

## 🎯 Features Implemented

### 1. Login Module
- ✅ Complete authentication system
- ✅ Email/password login with validation
- ✅ Demo credentials for testing
- ✅ Beautiful gradient UI with features showcase
- ✅ Responsive design
- ✅ Password toggle visibility
- ✅ Forgot password flow

### 2. Dashboard
- ✅ Role-based dashboard views
- ✅ Admin/Super Admin dashboard with charts
- ✅ Real-time performance trends (Chart.js)
- ✅ Organ distribution visualization
- ✅ System alerts and notifications
- ✅ Recent activity feed
- ✅ Upcoming schedule
- ✅ Statistical cards with metrics

### 3. User Management (Super Admin)
- ✅ User list with search functionality
- ✅ Add new administrators
- ✅ Approve pending users
- ✅ Delete users (except super admin)
- ✅ Role-based badges
- ✅ Status indicators
- ✅ Modal-based add admin form

## 🚀 Installation & Setup

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn

### Steps

1. **Install Dependencies**
```bash
npm install
```

2. **Start Development Server**
```bash
npm run dev
```

3. **Build for Production**
```bash
npm run build
```

4. **Preview Production Build**
```bash
npm run preview
```

## 🔑 Demo Credentials

### Super Admin
- **Email:** admin@odcat.com
- **Password:** Admin@123

### Admin
- **Email:** dr.ali@odcat.com
- **Password:** Admin@123

### Hospital
- **Email:** cmh@odcat.com
- **Password:** Admin@123

## 📁 Project Structure

```
odcat-react-app/
├── src/
│   ├── components/
│   │   ├── Login.jsx          # Login page component
│   │   ├── Dashboard.jsx      # Dashboard with charts
│   │   └── UserManagement.jsx # User management interface
│   ├── utils/
│   │   ├── auth.js            # Authentication utilities
│   │   └── toast.js           # Toast notification system
│   ├── styles/
│   │   └── App.css            # Main stylesheet
│   ├── App.jsx                # Main app component with routing
│   └── main.jsx               # Entry point
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

## 💾 Data Storage

The application uses **localStorage** for data persistence:
- User accounts stored in `odcat_users`
- Credentials stored in `odcat_creds`
- Current session stored in `odcat_current`

## 🎨 Styling

- Custom CSS with CSS variables for theming
- Responsive design for mobile, tablet, and desktop
- DM Sans font for UI elements
- Playfair Display font for headlines
- Professional color scheme matching ODCAT branding

## 📊 Libraries Used

- **React 18** - UI framework
- **Chart.js 4** - Data visualization
- **react-chartjs-2** - React wrapper for Chart.js
- **Vite** - Build tool and dev server

## 🔐 Security Notes

- Passwords are stored in localStorage (for demo purposes only)
- In production, use proper backend authentication
- Implement JWT tokens or session management
- Add password hashing and encryption

## 🌐 Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## 📝 Next Steps for Team Integration

1. **Ramzan's Donor Management Module**
   - Create `src/components/DonorManagement.jsx`
   - Add donor-specific routes in `App.jsx`
   - Integrate with existing auth system

2. **Eman's Recipient Management Module**
   - Create `src/components/RecipientManagement.jsx`
   - Add recipient-specific routes in `App.jsx`
   - Use existing data structures

3. **GitHub Integration**
   ```bash
   # Initialize git repository
   git init
   
   # Add all files
   git add .
   
   # Commit
   git commit -m "Initial commit: Login, Dashboard, User Management"
   
   # Add remote
   git remote add origin [YOUR_REPO_URL]
   
   # Push to GitHub
   git push -u origin main
   ```

4. **Pull Changes from Teammates**
   ```bash
   git pull origin main
   ```

## 🎓 Development Tips

- Run `npm run dev` for hot-reload during development
- Use browser DevTools for debugging
- Check localStorage in Application tab for data inspection
- Toast notifications appear top-right for all actions

## 📞 Support

For any issues or questions, contact your team members:
- Login/Dashboard/User Management: [Your Name]
- Donor Management: Ramzan
- Recipient Management: Eman

---

**© 2026 ODCAT Healthcare** · Saving lives through organ donation
