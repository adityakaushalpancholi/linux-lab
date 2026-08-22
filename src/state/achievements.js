// Badges are derived from progress, never stored separately. That way they can
// never disagree with what the learner actually did.

import { countDone } from './progress.js';

const MISSION_BADGE = {
  setup: { icon: '🖥', name: 'Workstation Ready' },
  navigate: { icon: '🧭', name: 'Never Lost' },
  files: { icon: '🎬', name: 'Set Builder' },
  inspect: { icon: '🔍', name: 'Log Detective' },
  permissions: { icon: '🔐', name: 'Gatekeeper' },
  search: { icon: '🕵', name: 'Code Detective' },
  pipes: { icon: '🔗', name: 'Pipeline Engineer' },
  productivity: { icon: '⚡', name: 'Terminal Explorer' }
};

const MILESTONES = [
  {
    id: 'first-command',
    icon: '👋',
    name: 'First Contact',
    detail: 'Ran your first command',
    earned: (s) => (s.sessionLog || []).length >= 1
  },
  {
    id: 'fifty-commands',
    icon: '⌨',
    name: 'Getting Fluent',
    detail: 'Ran 50 commands',
    earned: (s) => (s.sessionLog || []).length >= 50
  },
  {
    id: 'treasure',
    icon: '💎',
    name: 'Treasure Hunter',
    detail: 'Found Treasure.txt using only the terminal',
    earned: (s) => (s.sessionLog || []).some((e) => /Treasure\.txt/.test(e.input))
  },
  {
    id: 'pipeline',
    icon: '🚿',
    name: 'Plumber',
    detail: 'Built a pipeline with three or more stages',
    earned: (s) => (s.sessionLog || []).some((e) => (e.input.match(/\|/g) || []).length >= 2)
  },
  {
    id: 'quiz-ace',
    icon: '🎯',
    name: 'Straight Answers',
    detail: 'Answered every question in a quiz correctly',
    earned: (s, lessons) =>
      lessons.some((l) => {
        const a = (s.quiz || {})[l.id] || {};
        return l.quiz.length > 0 && l.quiz.every((q, i) => a[i] === q.answer);
      })
  },
  {
    id: 'reporter',
    icon: '📄',
    name: 'Documented',
    detail: 'Exported a PDF report',
    earned: (s) => !!s.reportGenerated
  },
  {
    id: 'graduate',
    icon: '🏅',
    name: 'Module 1 Graduate',
    detail: 'Completed every task in every mission',
    earned: (s, lessons) => lessons.every((l) => countDone(s.tasks || {}, l) === l.tasks.length)
  }
];

export function computeAchievements(state, lessons) {
  const out = [];

  for (const lesson of lessons) {
    const badge = MISSION_BADGE[lesson.id];
    if (!badge) continue;
    const done = countDone(state.tasks || {}, lesson);
    out.push({
      id: 'mission-' + lesson.id,
      icon: badge.icon,
      name: badge.name,
      detail: `Mission ${lesson.number} — ${lesson.title}`,
      earned: done === lesson.tasks.length,
      progress: `${done}/${lesson.tasks.length}`
    });
  }

  for (const m of MILESTONES) {
    let earned = false;
    try {
      earned = !!m.earned(state, lessons);
    } catch {
      earned = false;
    }
    out.push({ id: m.id, icon: m.icon, name: m.name, detail: m.detail, earned });
  }

  return out;
}

export function earnedCount(achievements) {
  return achievements.filter((a) => a.earned).length;
}
