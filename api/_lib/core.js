// Shared helpers for the serverless API: database access, sessions, validation.

import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';

const COOKIE = 'linuxlab_session';
const SESSION_DAYS = 30;

/* ------------------------------------------------------------------- env --- */

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Set it in the Vercel dashboard ` +
        '(Settings -> Environment Variables) and in .env.local for local dev.'
    );
  }
  return value;
}

let cachedDb = null;

export function db() {
  if (!cachedDb) {
    cachedDb = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return cachedDb;
}

function secret() {
  return new TextEncoder().encode(required('JWT_SECRET'));
}

/* -------------------------------------------------------------- sessions --- */

export async function createSession(userId) {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
}

export async function readSession(req) {
  const raw = req.headers.cookie || '';
  const match = raw.split(';').map((c) => c.trim()).find((c) => c.startsWith(COOKIE + '='));
  if (!match) return null;
  try {
    const { payload } = await jwtVerify(decodeURIComponent(match.slice(COOKIE.length + 1)), secret());
    return payload.sub || null;
  } catch {
    return null;
  }
}

export function setSessionCookie(res, token) {
  const parts = [
    `${COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_DAYS * 24 * 60 * 60}`
  ];
  if (process.env.VERCEL) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res) {
  const parts = [`${COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (process.env.VERCEL) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

/* ------------------------------------------------------------- passwords --- */

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

/* ------------------------------------------------------------ validation --- */

// Accepts the way people actually type numbers: spaces, dashes, +country code.
// Stores digits only so "98765 43210" and "9876543210" are the same account.
export function normalisePhone(input) {
  if (typeof input !== 'string') return null;
  const digits = input.replace(/[\s()-]/g, '').replace(/^\+/, '');
  if (!/^\d{7,15}$/.test(digits)) return null;
  return digits;
}

export function validateName(input) {
  if (typeof input !== 'string') return null;
  const name = input.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 60) return null;
  return name;
}

export function validatePassword(input) {
  if (typeof input !== 'string') return null;
  if (input.length < 8 || input.length > 200) return null;
  return input;
}

/* --------------------------------------------------------------- replies --- */

export function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
}

export function methodGuard(req, res, ...allowed) {
  if (allowed.includes(req.method)) return true;
  res.setHeader('Allow', allowed.join(', '));
  json(res, 405, { error: `Use ${allowed.join(' or ')} for this endpoint.` });
  return false;
}

export async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return await new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch {
        resolve({});
      }
    });
  });
}

// Wraps a handler so a thrown error becomes a clean 500 instead of a crash,
// and so a missing env var produces a message that says how to fix it.
export function handler(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      const configIssue = /Missing environment variable/.test(err.message);
      json(res, configIssue ? 503 : 500, {
        error: configIssue ? err.message : 'Something went wrong on the server.'
      });
    }
  };
}

export function publicUser(row) {
  return { id: row.id, name: row.name, phone: row.phone };
}
