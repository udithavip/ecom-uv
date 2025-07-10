import React from 'react';
import { Link } from 'react-router-dom';
// import { useSelector, useDispatch } from 'react-redux';
// import { logout } from '../../store/slices/authSlice'; // Example

const Navbar = () => {
  // const dispatch = useDispatch();
  // const { isAuthenticated, user } = useSelector((state) => state.auth);

  // const onLogout = () => {
  //   dispatch(logout());
  // };

  // const authLinks = (
  //   <ul className="navbar-nav ms-auto">
  //     <li className="nav-item">
  //       <Link className="nav-link" to="/dashboard">
  //         <i className="fas fa-user"></i>{' '}
  //         <span className="hide-sm">{user && user.name}</span>
  //       </Link>
  //     </li>
  //     {user && user.role === 'seller' && (
  //       <li className="nav-item">
  //         <Link className="nav-link" to="/my-products">My Products</Link>
  //       </li>
  //     )}
  //     {user && user.role === 'admin' && (
  //       <li className="nav-item">
  //         <Link className="nav-link" to="/admin/dashboard">Admin</Link>
  //       </li>
  //     )}
  //     <li className="nav-item">
  //       <a onClick={onLogout} href="#!" className="nav-link">
  //         <i className="fas fa-sign-out-alt"></i>{' '}
  //         <span className="hide-sm">Logout</span>
  //       </a>
  //     </li>
  //   </ul>
  // );

  // const guestLinks = (
    <ul className="navbar-nav ms-auto">
      <li className="nav-item">
        <Link className="nav-link" to="/products">Products</Link>
      </li>
      <li className="nav-item">
        <Link className="nav-link" to="/auctions">Auctions</Link>
      </li>
      <li className="nav-item">
        <Link className="nav-link" to="/cart">
            <i className="fas fa-shopping-cart"></i> Cart
            {/* Add badge for cart items count */}
        </Link>
      </li>
      <li className="nav-item">
        <Link className="nav-link" to="/register">Register</Link>
      </li>
      <li className="nav-item">
        <Link className="nav-link" to="/login">Login</Link>
      </li>
    </ul>
  // );

  return (
    <nav className="navbar navbar-expand-sm navbar-dark bg-dark mb-4">
      <div className="container">
        <Link className="navbar-brand" to="/">MERN E-Commerce</Link>
        <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
          <span className="navbar-toggler-icon"></span>
        </button>
        <div className="collapse navbar-collapse" id="navbarNav">
          {/* {isAuthenticated ? authLinks : guestLinks} */}
          {/* For now, always show guest links */}
          { /* guestLinks */ }
           <ul className="navbar-nav ms-auto">
            <li className="nav-item">
                <Link className="nav-link" to="/products">Products</Link>
            </li>
            <li className="nav-item">
                <Link className="nav-link" to="/auctions">Auctions</Link>
            </li>
            <li className="nav-item">
                <Link className="nav-link" to="/cart">
                    <i className="fas fa-shopping-cart"></i> Cart
                </Link>
            </li>
            <li className="nav-item">
                <Link className="nav-link" to="/register">Register</Link>
            </li>
            <li className="nav-item">
                <Link className="nav-link" to="/login">Login</Link>
            </li>
             <li className="nav-item">
              <Link className="nav-link" to="/dashboard">My Account</Link>
            </li>
             <li className="nav-item">
              <Link className="nav-link" to="/admin/users">Admin Users</Link> {/* Example Admin Link */}
            </li>
          </ul>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
