import React from 'react';

export default function AchievementsPanel({ achievements, progress, onClose }) {
  const missions = achievements.filter((a) => a.id.startsWith('mission-'));
  const milestones = achievements.filter((a) => !a.id.startsWith('mission-'));
  const earned = achievements.filter((a) => a.earned).length;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal achievements" onClick={(e) => e.stopPropagation()} role="dialog">
        <header>
          <div>
            <h2>Achievements</h2>
            <p>
              {earned} of {achievements.length} unlocked · {progress.done}/{progress.total} tasks done
            </p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <h3>Missions</h3>
        <div className="badge-grid">
          {missions.map((a) => (
            <Badge key={a.id} a={a} />
          ))}
        </div>

        <h3>Milestones</h3>
        <div className="badge-grid">
          {milestones.map((a) => (
            <Badge key={a.id} a={a} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Badge({ a }) {
  return (
    <div className={'badge' + (a.earned ? ' earned' : '')} title={a.detail}>
      <span className="badge-icon">{a.icon}</span>
      <span className="badge-name">{a.name}</span>
      <span className="badge-detail">{a.detail}</span>
      {!a.earned && a.progress && <span className="badge-progress">{a.progress}</span>}
    </div>
  );
}
