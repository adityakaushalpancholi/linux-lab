// Everything the learner has done, kept in localStorage so a refresh or a
// closed tab never costs them progress.

const KEY = 'linux-lab-v1';

const EMPTY = {
  name: '',
  currentLesson: 'setup',
  tasks: {}, // lessonId -> { taskId: true }
  quiz: {}, // lessonId -> { questionIndex: chosenOption }
  reflections: {}, // lessonId -> string
  transcript: {}, // lessonId -> [{ cwd, input, output }]
  sessionLog: [], // every command, in order, regardless of which lesson was open
  reportGenerated: false,
  autofix: false,
  theme: 'dark',
  shell: null
};

export function loadProgress() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw);
    return { ...EMPTY, ...parsed };
  } catch {
    return { ...EMPTY };
  }
}

let writeTimer = null;

export function saveProgress(state) {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // Quota exceeded, most likely from a very long transcript. Drop the
      // transcript rather than losing task progress.
      try {
        localStorage.setItem(KEY, JSON.stringify({ ...state, transcript: {}, sessionLog: [] }));
      } catch {
        /* nothing more we can do */
      }
    }
  }, 250);
}

export function clearProgress() {
  localStorage.removeItem(KEY);
}

export function countDone(tasks, lesson) {
  const done = tasks[lesson.id] || {};
  return lesson.tasks.filter((t) => done[t.id]).length;
}

export function overallProgress(state, lessons) {
  let done = 0;
  let total = 0;
  for (const l of lessons) {
    total += l.tasks.length;
    done += countDone(state.tasks, l);
  }
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}
