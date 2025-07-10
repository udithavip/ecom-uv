import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios'; // You'll need an API service utility for this
import jwt_decode from 'jwt-decode';

// Placeholder for API service - In a real app, this would be more robust
const API_URL = '/api'; // Adjust if your backend proxy is different

// Helper to set auth token in local storage and axios headers
const setAuthToken = token => {
  if (token) {
    localStorage.setItem('token', token);
    axios.defaults.headers.common['x-auth-token'] = token;
  } else {
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['x-auth-token'];
  }
};

// Async thunk for user registration
export const registerUser = createAsyncThunk(
  'auth/registerUser',
  async (userData, { rejectWithValue }) => {
    try {
      const config = { headers: { 'Content-Type': 'application/json' } };
      const res = await axios.post(`${API_URL}/users/register`, userData, config);
      setAuthToken(res.data.token);
      return jwt_decode(res.data.token); // Decode token to get user info
    } catch (err) {
      // Clear token on error too if server sent one for a failed login for some reason
      setAuthToken(null);
      return rejectWithValue(err.response ? err.response.data.errors || err.response.data : { msg: 'Registration failed' });
    }
  }
);

// Async thunk for user login
export const loginUser = createAsyncThunk(
  'auth/loginUser',
  async (userData, { rejectWithValue }) => {
    try {
      const config = { headers: { 'Content-Type': 'application/json' } };
      const res = await axios.post(`${API_URL}/auth/login`, userData, config);
      setAuthToken(res.data.token);
      return jwt_decode(res.data.token);
    } catch (err) {
      setAuthToken(null);
      return rejectWithValue(err.response ? err.response.data.errors || err.response.data : { msg: 'Login failed' });
    }
  }
);

// Async thunk to load user if token exists
export const loadUser = createAsyncThunk(
  'auth/loadUser',
  async (_, { rejectWithValue, dispatch }) => {
    const token = localStorage.getItem('token');
    if (token) {
      setAuthToken(token); // Set auth header
      try {
        const decoded = jwt_decode(token);
        // Check token expiry
        if (decoded.exp * 1000 < Date.now()) {
          dispatch(logout()); // Logout if token expired
          return rejectWithValue({ msg: "Token expired" });
        }
        // Optionally, fetch user data from /api/auth to verify token server-side
        // const res = await axios.get(`${API_URL}/auth`);
        // return res.data; // This would return the full user object from backend
        return decoded; // For now, return decoded token (contains user id and role)
      } catch (err) {
        dispatch(logout()); // Logout on any error with token
        return rejectWithValue(err.response ? err.response.data : { msg: 'Token validation failed' });
      }
    }
    return rejectWithValue(null); // No token found
  }
);


const initialState = {
  token: localStorage.getItem('token'),
  isAuthenticated: null,
  loading: false, // Changed from true to false for initial load state
  user: null, // Will store decoded token info or user object from /api/auth
  error: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout: (state) => {
      setAuthToken(null);
      state.token = null;
      state.isAuthenticated = false;
      state.loading = false;
      state.user = null;
      state.error = null;
    },
    clearErrors: (state) => {
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder
      // Register
      .addCase(registerUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(registerUser.fulfilled, (state, action) => {
        state.loading = false;
        state.isAuthenticated = true;
        state.user = action.payload.user; // Assumes payload is decoded token { user: {id, role, ...} }
        state.token = localStorage.getItem('token');
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.loading = false;
        state.isAuthenticated = false;
        state.user = null;
        state.token = null;
        state.error = action.payload || [{ msg: 'Registration Failed' }];
      })
      // Login
      .addCase(loginUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.loading = false;
        state.isAuthenticated = true;
        state.user = action.payload.user;
        state.token = localStorage.getItem('token');
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.loading = false;
        state.isAuthenticated = false;
        state.user = null;
        state.token = null;
        state.error = action.payload || [{ msg: 'Login Failed' }];
      })
      // Load User
      .addCase(loadUser.pending, (state) => {
        state.loading = true;
      })
      .addCase(loadUser.fulfilled, (state, action) => {
        state.loading = false;
        state.isAuthenticated = true;
        state.user = action.payload.user; // Assuming decoded token payload is { user: {id, role} }
                                        // If /api/auth is used, action.payload would be the user object itself
      })
      .addCase(loadUser.rejected, (state, action) => {
        state.loading = false;
        state.isAuthenticated = false;
        state.user = null;
        state.token = null; // Ensure token is cleared if loadUser fails
        // Optionally set error: state.error = action.payload;
      });
  },
});

export const { logout, clearErrors } = authSlice.actions;
export default authSlice.reducer;
