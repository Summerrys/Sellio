import React from 'react';
import { Navigate } from 'react-router-dom';

// Me lives in Explore now (one Me for everyone); old links land there.
export default function Me() {
  return <Navigate to="/explore/me" replace />;
}
