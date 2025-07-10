import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Navbar from './components/layout/Navbar'; // Will create this
import Landing from './components/layout/Landing'; // Will create this
import Register from './components/auth/Register'; // Will create this
import Login from './components/auth/Login'; // Will create this
// import Alert from './components/layout/Alert'; // For displaying messages

// Redux
import { Provider } from 'react-redux';
import store from './store'; // Will create this

import './App.css';

const App = () => {
  return (
    <Provider store={store}>
      <Router>
        <Navbar />
        {/* <Alert /> */}
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
          {/* More routes will be added here */}
        </Routes>
      </Router>
    </Provider>
  );
};

export default App;
