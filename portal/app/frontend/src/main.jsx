import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import AdminApp from './admin/AdminApp.jsx'
import './index.css'

// Simple routing based on URL path
const isAdmin = window.location.pathname.startsWith('/admin');

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        {isAdmin ? <AdminApp /> : <App />}
    </React.StrictMode>,
)

