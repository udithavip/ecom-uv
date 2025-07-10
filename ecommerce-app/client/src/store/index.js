import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
// Import other reducers/slices here as they are created
// import productReducer from './slices/productSlice';
// import cartReducer from './slices/cartSlice';
// import orderReducer from './slices/orderSlice';
// import auctionReducer from './slices/auctionSlice';
// import alertReducer from './slices/alertSlice'; // For UI notifications

const store = configureStore({
  reducer: {
    auth: authReducer,
    // product: productReducer,
    // cart: cartReducer,
    // order: orderReducer,
    // auction: auctionReducer,
    // alert: alertReducer,
    // Add other reducers here
  },
  // Middleware can be added here if needed, RTK includes thunk by default
  // devTools should be enabled by default in development
});

export default store;
