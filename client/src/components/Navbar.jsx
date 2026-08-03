import React from 'react';
import { NavLink } from 'react-router-dom';
import { AlertTriangle, MapPin, AlertOctagon, User, LogIn, Rss } from 'lucide-react';

const Navbar = () => {
  return (
    <nav className="navbar">
      <div className="navbar-container">
        {/* Brand Logo & Title */}
        <NavLink to="/" className="navbar-brand">
          <AlertTriangle color="#e63946" size={28} />
          <span>Sri Lanka Hazard Alert</span>
          <span className="navbar-brand-badge">SPM_NU_WE_01</span>
        </NavLink>

        {/* Navigation Links */}
        <ul className="navbar-links">
          <li>
            <NavLink to="/" className={({ isActive }) => isActive ? 'active' : ''}>
              <MapPin size={16} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
              Live Map
            </NavLink>
          </li>
          <li>
            <NavLink to="/feed" className={({ isActive }) => isActive ? 'active' : ''}>
              <Rss size={16} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
              Reports Feed
            </NavLink>
          </li>
          <li>
            <NavLink to="/report" className={({ isActive }) => isActive ? 'active' : ''}>
              <AlertOctagon size={16} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
              Report Hazard
            </NavLink>
          </li>
          <li>
            <NavLink to="/login" className={({ isActive }) => isActive ? 'active' : ''}>
              <LogIn size={16} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
              Login
            </NavLink>
          </li>
          <li>
            <NavLink to="/register" className="btn-nav-primary">
              <User size={16} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
              Register
            </NavLink>
          </li>
        </ul>
      </div>
    </nav>
  );
};

export default Navbar;
