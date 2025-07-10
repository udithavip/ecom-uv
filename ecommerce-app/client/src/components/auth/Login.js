import React, { useState } from 'react';
// import { useDispatch, useSelector } from 'react-redux';
// import { loginUser } from '../../store/slices/authSlice'; // Example
import { Link, Navigate } from 'react-router-dom';

const Login = () => {
  // const dispatch = useDispatch();
  // const { isAuthenticated, loading, error } = useSelector((state) => state.auth);

  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  const { email, password } = formData;

  const onChange = (e) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    // dispatch(loginUser({ email, password }));
    console.log('Logging in user:', { email, password });
  };

  // if (isAuthenticated) {
  //   return <Navigate to="/dashboard" />;
  // }

  return (
    <div className="container">
      <h1 className="large text-primary">Sign In</h1>
      <p className="lead">
        <i className="fas fa-user"></i> Sign Into Your Account
      </p>
      {/* {error && <div className="alert alert-danger">{typeof error === 'string' ? error : error.msg || 'Login failed'}</div>} */}
      <form className="form" onSubmit={onSubmit}>
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
        <input type="submit" className="btn btn-primary" value="Login" /> {/* {loading && 'disabled'} */}
      </form>
      <p className="my-1">
        Don't have an account? <Link to="/register">Sign Up</Link>
      </p>
    </div>
  );
};

export default Login;
