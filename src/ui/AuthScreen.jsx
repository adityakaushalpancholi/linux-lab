import React, { useState, useRef, useEffect } from 'react';
import { api } from '../state/api.js';

export default function AuthScreen({ onAuthenticated, onSkip, accountsAvailable = true }) {
  const [mode, setMode] = useState('signin');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [field, setField] = useState(null);
  const [busy, setBusy] = useState(false);
  const [resetPending, setResetPending] = useState(false);
  const firstInput = useRef(null);

  useEffect(() => {
    firstInput.current?.focus();
  }, [mode]);

  const switchMode = (next) => {
    setMode(next);
    setError(null);
    setField(null);
    setResetPending(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setField(null);

    const result =
      mode === 'signup'
        ? await api.signup(name, phone, password)
        : await api.login(phone, password);

    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      setField(result.field || null);
      if (result.data?.resetPending) setResetPending(true);
      return;
    }

    onAuthenticated(result.data.user, result.data.progress, {
      passwordWasReset: !!result.data.passwordWasReset
    });
  };

  return (
    <div className="auth-screen">
      <div className="auth-grid">
        <section className="auth-pitch">
          <div className="auth-brand">
            <span className="brand-mark">$_</span>
            <span>Linux Lab</span>
          </div>

          <h1>
            Learn the terminal
            <br />
            without breaking anything.
          </h1>

          <p className="auth-lede">
            A real Linux terminal that lives in your browser. Eight guided missions, from your first{' '}
            <code>whoami</code> to hunting bugs through a codebase with <code>grep</code>. Nothing to
            install, and nothing you type can damage your computer.
          </p>

          <ul className="auth-points">
            <li>
              <strong>It corrects you.</strong> Type <code>cd..</code> or <code>dir</code> and it explains
              the fix instead of just failing.
            </li>
            <li>
              <strong>Tasks tick themselves.</strong> Build the folders and the checklist goes green on its
              own.
            </li>
            <li>
              <strong>Your work is saved.</strong> Sign in from anywhere and pick up exactly where you left
              off.
            </li>
            <li>
              <strong>Export a PDF report.</strong> Commands, outputs and reflections, ready to submit.
            </li>
          </ul>

          <pre className="auth-demo">
            <span className="d-prompt">student@atlas</span>:<span className="d-path">~</span>${' '}
            <span className="d-cmd">whoami</span>
            {'\n'}student{'\n'}
            <span className="d-prompt">student@atlas</span>:<span className="d-path">~</span>${' '}
            <span className="d-cmd">echo &quot;Hello Kalvium&quot;</span>
            {'\n'}Hello Kalvium
          </pre>

          <Signature />
        </section>

        <section className="auth-panel">
          {!accountsAvailable && (
            <div className="auth-notice">
              <strong>Accounts are not switched on yet.</strong>
              <span>
                Everything works, but your progress will stay on this device. Use the button below to
                start.
              </span>
            </div>
          )}

          <div className="auth-tabs">
            <button
              className={mode === 'signin' ? 'active' : ''}
              onClick={() => switchMode('signin')}
              type="button"
            >
              Sign in
            </button>
            <button
              className={mode === 'signup' ? 'active' : ''}
              onClick={() => switchMode('signup')}
              type="button"
            >
              Create account
            </button>
          </div>

          <form onSubmit={submit} noValidate>
            {mode === 'signup' && (
              <label className={'auth-field' + (field === 'name' ? ' has-error' : '')}>
                <span>Your name</span>
                <input
                  ref={mode === 'signup' ? firstInput : null}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Aditya Sharma"
                  autoComplete="name"
                />
                <small>This goes on your PDF report.</small>
              </label>
            )}

            <label className={'auth-field' + (field === 'phone' ? ' has-error' : '')}>
              <span>Phone number</span>
              <input
                ref={mode === 'signin' ? firstInput : null}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="98765 43210"
                inputMode="tel"
                autoComplete="tel"
              />
              <small>This is how you sign back in. Spaces and +91 are fine.</small>
            </label>

            <label className={'auth-field' + (field === 'password' ? ' has-error' : '')}>
              <span>{resetPending ? 'Choose a new password' : 'Password'}</span>
              <div className="auth-password">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                />
                <button type="button" onClick={() => setShowPassword((s) => !s)}>
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {mode === 'signup' && <small>Pick something you will remember.</small>}
            </label>

            {error && (
              <div className="auth-error" role="alert">
                {error}
              </div>
            )}

            <button className="auth-submit" type="submit" disabled={busy}>
              {busy ? 'Just a moment…' : mode === 'signup' ? 'Create account and start' : 'Sign in'}
            </button>
          </form>

          <div className="auth-alt">
            {mode === 'signin' ? (
              <>
                <p>
                  New here?{' '}
                  <button type="button" onClick={() => switchMode('signup')}>
                    Create an account
                  </button>
                </p>
                <p className="auth-forgot">
                  Forgotten your password? Ask whoever set up this class to reset it for you, then sign in
                  and choose a new one.
                </p>
              </>
            ) : (
              <p>
                Already have an account?{' '}
                <button type="button" onClick={() => switchMode('signin')}>
                  Sign in
                </button>
              </p>
            )}
          </div>

          <div className="auth-guest">
            <button type="button" onClick={onSkip}>
              Just look around first
            </button>
            <small>Progress stays on this device only, and is not saved to your account.</small>
          </div>
        </section>
      </div>
    </div>
  );
}

// The credit, written so that decoding it is itself a lesson. Anyone who
// finishes Mission 7 has everything they need to read it, and there is a
// hidden ~/.signature in the filesystem for whoever runs ls -a.
function Signature() {
  const [decoded, setDecoded] = useState(false);

  return (
    <div className="signature">
      <span className="sig-rule" aria-hidden />

      <div className="sig-main">
        <span className="sig-lead">designed, built and broken repeatedly by</span>
        <span className="sig-name">Aditya Sharma</span>
        <span className="sig-role">
          every command, every lesson, every safety rail &mdash; one pair of hands
        </span>
      </div>

      <button
        className={'sig-verify' + (decoded ? ' is-decoded' : '')}
        onClick={() => setDecoded((d) => !d)}
        title="Decode it"
      >
        <span className="sig-dollar">$</span>
        {decoded ? (
          <span className="sig-out">aditya</span>
        ) : (
          <code>echo YWRpdHlh | base64 -d</code>
        )}
        <span className="sig-verify-hint">
          {decoded ? 'told you' : 'run it in the lab terminal'}
        </span>
      </button>
    </div>
  );
}
