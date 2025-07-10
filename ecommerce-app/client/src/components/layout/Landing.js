import React from 'react';
import { Link }
from 'react-router-dom';

const Landing = () => {
  return (
    <section className="landing">
      <div className="dark-overlay">
        <div className="landing-inner">
          <h1 className="x-large">E-Commerce Platform</h1>
          <p className="lead">
            Buy, Sell, and Auction amazing products. Create your account to get started.
          </p>
          <div className="buttons">
            <Link to="/register" className="btn btn-primary me-2">
              Sign Up
            </Link>
            <Link to="/login" className="btn btn-light">
              Login
            </Link>
          </div>
           <div className="mt-4">
            <Link to="/products" className="btn btn-info">
              Browse Products
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Landing;
