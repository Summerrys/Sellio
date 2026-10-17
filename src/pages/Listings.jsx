import React from 'react';
import { Navigate } from 'react-router-dom';

// Listings lives in Explore now (one Listings tab for everyone); old links land there.
export default function Listings() {
  return <Navigate to="/explore/listings" replace />;
}
