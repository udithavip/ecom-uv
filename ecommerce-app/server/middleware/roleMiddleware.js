// This middleware assumes authMiddleware has already run and set req.user

const authorizeRole = (roles) => { // roles can be a single role string or an array of roles
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({ msg: 'User role not found, authorization denied' });
    }

    const userRoles = Array.isArray(roles) ? roles : [roles];

    if (!userRoles.includes(req.user.role)) {
      return res.status(403).json({ msg: 'Access denied. You do not have the required role.' });
    }
    next();
  };
};

module.exports = authorizeRole;
