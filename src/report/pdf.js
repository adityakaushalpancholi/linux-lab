// Builds the single-file PDF report the assignments ask for.

import { countDone } from '../state/progress.js';

const MARGIN = 46;
const PAGE_W = 595; // A4 portrait, points
const PAGE_H = 842;
const BODY_W = PAGE_W - MARGIN * 2;

export async function buildReport(state, lessons) {
  // jsPDF is ~500kB, so it is only fetched when someone actually exports.
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  let y = MARGIN;
  let page = 1;

  const stripMarkers = (t) =>
    t.replace(new RegExp(String.fromCharCode(1) + '[dxm]', 'g'), '').replace(
      new RegExp(String.fromCharCode(2), 'g'),
      ''
    );

  const footer = () => {
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(150);
    doc.text(`Linux Lab report  ·  page ${page}`, MARGIN, PAGE_H - 24);
    doc.setTextColor(0);
  };

  const newPage = () => {
    footer();
    doc.addPage();
    page++;
    y = MARGIN;
  };

  const space = (needed) => {
    if (y + needed > PAGE_H - MARGIN) newPage();
  };

  const heading = (text, size = 16) => {
    space(size + 22);
    doc.setFont('helvetica', 'bold').setFontSize(size).setTextColor(20);
    doc.text(text, MARGIN, y);
    y += size + 8;
  };

  const para = (text, { size = 10.5, gap = 6, color = 60 } = {}) => {
    doc.setFont('helvetica', 'normal').setFontSize(size).setTextColor(color);
    const wrapped = doc.splitTextToSize(text, BODY_W);
    for (const line of wrapped) {
      space(size + 4);
      doc.text(line, MARGIN, y);
      y += size + 3;
    }
    y += gap;
  };

  const label = (text) => {
    space(18);
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(110);
    doc.text(text.toUpperCase(), MARGIN, y);
    y += 14;
  };

  const codeBlock = (text) => {
    const lines = stripMarkers(text).replace(/\s+$/, '').split('\n');
    const wrapped = [];
    doc.setFont('courier', 'normal').setFontSize(8.5);
    for (const line of lines) wrapped.push(...doc.splitTextToSize(line || ' ', BODY_W - 16));

    let i = 0;
    while (i < wrapped.length) {
      const remaining = PAGE_H - MARGIN - y - 14;
      const fit = Math.max(1, Math.floor(remaining / 11));
      const chunk = wrapped.slice(i, i + fit);
      const h = chunk.length * 11 + 12;

      doc.setFillColor(244, 245, 247);
      doc.roundedRect(MARGIN, y, BODY_W, h, 3, 3, 'F');
      doc.setFont('courier', 'normal').setFontSize(8.5).setTextColor(35);
      chunk.forEach((line, n) => doc.text(line, MARGIN + 8, y + 14 + n * 11));

      y += h + 8;
      i += fit;
      if (i < wrapped.length) newPage();
    }
    doc.setTextColor(0);
  };

  const checkline = (done, text) => {
    space(16);
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(done ? 22 : 150);
    doc.text(done ? '[x]' : '[ ]', MARGIN, y);
    doc.setFont('helvetica', 'normal').setTextColor(done ? 40 : 150);
    const wrapped = doc.splitTextToSize(text, BODY_W - 24);
    wrapped.forEach((line, n) => {
      if (n > 0) space(13);
      doc.text(line, MARGIN + 22, y);
      if (n < wrapped.length - 1) y += 13;
    });
    y += 15;
    doc.setTextColor(0);
  };

  const rule = () => {
    space(14);
    doc.setDrawColor(225);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 14;
  };

  /* ------------------------------------------------------------ cover --- */

  doc.setFillColor(17, 20, 26);
  doc.rect(0, 0, PAGE_W, 150, 'F');
  doc.setFont('helvetica', 'bold').setFontSize(24).setTextColor(255);
  doc.text('Linux Workstation Report', MARGIN, 62);
  doc.setFont('helvetica', 'normal').setFontSize(11).setTextColor(170);
  doc.text('Module 1 · Terminal fundamentals · Project Atlas', MARGIN, 84);

  const totals = lessons.reduce(
    (acc, l) => {
      acc.done += countDone(state.tasks, l);
      acc.total += l.tasks.length;
      return acc;
    },
    { done: 0, total: 0 }
  );
  doc.setFontSize(10).setTextColor(140);
  doc.text(
    `${totals.done} of ${totals.total} tasks completed  ·  generated ${new Date().toLocaleString()}`,
    MARGIN,
    112
  );

  y = 186;
  doc.setTextColor(0);

  label('Student');
  para(state.name || '(name not entered)', { size: 13, color: 20 });

  label('Environment used');
  para(
    'Linux Lab browser terminal (virtual filesystem). Commands, outputs and directory state below were ' +
      'produced in that environment. Replace this section with your own screenshots if your assignment ' +
      'requires Git Bash, WSL2 or an Ubuntu VM.'
  );

  label('Summary');
  for (const l of lessons) {
    const done = countDone(state.tasks, l);
    checkline(done === l.tasks.length, `Mission ${l.number} — ${l.title}  (${done}/${l.tasks.length} tasks)`);
  }

  /* --------------------------------------------------------- missions --- */

  for (const lesson of lessons) {
    const doneMap = state.tasks[lesson.id] || {};
    const transcript = state.transcript[lesson.id] || [];
    const reflection = state.reflections[lesson.id];
    const quizAnswers = state.quiz[lesson.id] || {};
    const doneCount = countDone(state.tasks, lesson);

    if (!doneCount && !transcript.length && !reflection) continue;

    newPage();
    heading(`Mission ${lesson.number} — ${lesson.title}`, 15);
    para(lesson.subtitle, { color: 110 });
    rule();

    label(`Tasks (${doneCount}/${lesson.tasks.length})`);
    for (const task of lesson.tasks) checkline(!!doneMap[task.id], task.title);

    if (transcript.length) {
      label('Commands and output');
      const body = transcript
        .map((entry) => {
          const head = `student@atlas:${entry.cwd}$ ${entry.input}`;
          const out = (entry.output || '').replace(/\s+$/, '');
          return out ? `${head}\n${out}` : head;
        })
        .join('\n');
      codeBlock(body);
    }

    const answered = Object.keys(quizAnswers).length;
    if (answered) {
      let correct = 0;
      lesson.quiz.forEach((q, i) => {
        if (quizAnswers[i] === q.answer) correct++;
      });
      label('Quiz');
      para(`${correct} of ${lesson.quiz.length} correct.`);
      lesson.quiz.forEach((q, i) => {
        if (quizAnswers[i] === undefined) return;
        checkline(quizAnswers[i] === q.answer, `${q.q}  →  ${q.options[quizAnswers[i]]}`);
      });
    }

    if (reflection && reflection.trim()) {
      label('Reflection');
      para(reflection.trim(), { color: 40 });
    }
  }

  /* --------------------------------------------------------- appendix --- */
  // The per-mission transcripts above are filed by whichever lesson was open.
  // This is the unfiltered record, so nothing a learner did goes unreported.

  const sessionLog = state.sessionLog || [];
  if (sessionLog.length) {
    newPage();
    heading('Appendix — full command log', 15);
    para(
      `Every command run in this session, in order (${sessionLog.length} total). ` +
        'Useful when your assignment asks you to show your working.',
      { color: 110 }
    );
    rule();
    codeBlock(
      sessionLog
        .map((e) => {
          const head = `student@atlas:${e.cwd}$ ${e.input}`;
          const out = (e.output || '').replace(/\s+$/, '');
          return out ? `${head}\n${out}` : head;
        })
        .join('\n')
    );
  }

  footer();
  return doc;
}

export async function downloadReport(state, lessons) {
  const doc = await buildReport(state, lessons);
  const safeName = (state.name || 'student').replace(/[^\w-]+/g, '-').toLowerCase();
  doc.save(`linux-workstation-report-${safeName}.pdf`);
}
