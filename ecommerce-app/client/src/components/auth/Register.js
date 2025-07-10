import React, { useState } from 'react';
// import { useDispatch, useSelector } from 'react-redux';
// import { registerUser } from '../../store/slices/authSlice'; // Example
import { Link, Navigate } from 'react-router-dom';

const Register = () => {
  // const dispatch = useDispatch();
  // const { isAuthenticated, loading, error } = useSelector((state) => state.auth);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    password2: '',
    role: 'buyer', // Default role
  });

  const { name, email, password, password2, role } = formData;

  const onChange = (e) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    if (password !== password2) {
      // dispatch(setAlert('Passwords do not match', 'danger')); // Example alert
      console.error('Passwords do not match');
    } else {
      // dispatch(registerUser({ name, email, password, role }));
      console.log('Registering user:', { name, email, password, role });
    }
  };

  // if (isAuthenticated) {
  //   return <Navigate to="/dashboard" />;
  // }

  return (
    <div className="container">
      <h1 className="large text-primary">Sign Up</h1>
      <p className="lead">
        <i className="fas fa-user"></i> Create Your Account
      </p>
      {/* {error && <div className="alert alert-danger">{typeof error === 'string' ? error : error.msg || 'Registration failed'}</div>} */}
      <form className="form" onSubmit={onSubmit}>
        <div className="form-group mb-2">
          <input
            type="text"
            placeholder="Name"
            name="name"
            value={name}
            onChange={onChange}
            required
            className="form-control"
          />
        </div>
        <div className="form-group mb-2">
          <input
            type="email"
            placeholder="Email Address"
            name="email"
            value={email}
            onChange={onChange}
            required
            className="form-control"
          />
        </div>
        <div className="form-group mb-2">
          <input
            type="password"
            placeholder="Password"
            name="password"
            value={password}
            onChange={onChange}
            minLength="6"
            className="form-control"
          />
        </div>
        <div className="form-group mb-2">
          <input
            type="password"
            placeholder="Confirm Password"
            name="password2"
            value={password2}
            onChange={onChange}
            minLength="6"
            className="form-control"
          />
        </div>
        <div className="form-group mb-3">
          <label htmlFor="role" className="form-label">Register as:</label>
          <select name="role" value={role} onChange={onChange} className="form-select">
            <option value="buyer">Buyer</option>
            <option value="seller">Seller</option>
          </select>
        </div>
        <input type="submit" className="btn btn-primary" value="Register" /> {/* disabled={loading} */}
      </form>
      <p className="my-1">
        Already have an account? <Link to="/login">Sign In</Link>
      </p>
    </div>
  );
};

export default Register;
