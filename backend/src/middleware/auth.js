import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';

const resolveAuthUser = async (req) => {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;

  if (!token) {
    return null;
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    const user = await User.findOne({ uid: payload.uid }).lean();
    return user || null;
  } catch {
    return null;
  }
};

export const authOptional = async (req, _res, next) => {
  req.authUser = await resolveAuthUser(req);
  return next();
};

export const authRequired = async (req, res, next) => {
  req.authUser = await resolveAuthUser(req);
  if (!req.authUser) {
    return res.status(401).json({ message: 'Authentication required.' });
  }
  return next();
};

export const adminRequired = async (req, res, next) => {
  req.authUser = await resolveAuthUser(req);
  if (!req.authUser) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  if (req.authUser.role !== 'admin') {
    return res.status(403).json({ message: 'Admin role required.' });
  }

  return next();
};
