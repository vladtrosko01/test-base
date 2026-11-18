const params = new URLSearchParams(location.search);
const testId = params.get('id');
let testConfig = null, questionBank = [], questions = [], answers = {}, currentIndex = 0;
let timerId = null, remainingSeconds = 0, submitting = false, warningCount = 0;
let attemptKey = '', deadline = 0, violationLog = [], pendingAutoFinish = false;
let examStarted = false, fullscreenWasEntered = false, startedAt = null;
const $ = id => document.getElementById(id);

async function init() {
  try {
    const [testsResponse, questionsResponse] = await Promise.all([
      fetch('data/tests.json?v=20261118-2225'),
      fetch('data/questions.json?v=20261118-2225')
    ]);
    if (!testsResponse.ok || !questionsResponse.ok) throw new Error('Не удалось загрузить базу тестов.');
    const testsData = await testsResponse.json(), questionsData = await questionsResponse.json();
    testConfig = (testsData.tests || []).find(test => test.id === testId);
    if (!testConfig) throw new Error('Тест не найден. Вернитесь в каталог и выберите тест.');
    questionBank = (questionsData.questions || []).filter(question => question.testId === testId);
    if (!questionBank.length) throw new Error('В этом тесте пока нет вопросов.');
    $('startTestTitle').textContent = testConfig.title;
    $('startTestDescription').textContent = testConfig.description || 'Проверьте настройки перед началом.';
    const mode = testConfig.questionCountMode || 'fixed';
    const countLabel = mode === 'all' ? 'Все вопросы банка' : mode === 'random'
      ? 'Случайно: ' + (testConfig.questionCountMin || 3) + '–' + (testConfig.questionCountMax || testConfig.questionCount || 5)
      : 'Фиксировано: ' + (testConfig.questionCount || questionBank.length);
    $('startDetails').innerHTML = '<span>◷ ' + Number(testConfig.timeMinutes || 15) + ' минут</span><span>▤ ' + escapeHtml(countLabel) + '</span><span>Проходной балл: ' + Number(testConfig.passPercent ?? 60) + '%</span><span>Форматы: выбор · несколько · текст · изображение</span>';
    const requireFullscreen = isExamMode() && testConfig.security?.fullscreenRequired !== false;
    $('startFullscreenNote').hidden = !requireFullscreen;
    $('startExamBtn').textContent = requireFullscreen ? 'Войти в полноэкранный режим и начать' : 'Начать тест';
    $('startExamBtn').disabled = false;
    $('startStatus').textContent = requireFullscreen
      ? 'Нажмите кнопку: сначала включится полноэкранный режим, затем начнётся экзамен.'
      : 'Нажмите кнопку, чтобы начать тест.';
    $('startExamBtn').addEventListener('click', startExam);
  } catch (error) {
    $('startTestTitle').textContent = 'Не удалось открыть тест';
    $('startStatus').textContent = error.message;
    $('startStatus').className = 'editor-status error';
  }
}

function isExamMode() {
  return testConfig?.examMode ?? testConfig?.security?.enabled ?? true;
}

async function startExam() {
  const button = $('startExamBtn');
  if (button.disabled || examStarted) return;
  button.disabled = true;
  const requireFullscreen = isExamMode() && testConfig.security?.fullscreenRequired !== false;
  if (requireFullscreen) {
    if (!document.documentElement.requestFullscreen) {
      showStartError('Этот браузер не поддерживает полноэкранный режим. Используйте актуальный Chrome или Edge.');
      return;
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    try {
      await document.documentElement.requestFullscreen();
    } catch (error) {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      showStartError('Браузер не разрешил полноэкранный режим. Нажмите кнопку ещё раз и разрешите переход.');
      return;
    }
    if (!document.fullscreenElement) {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      showStartError('Полноэкранный режим не включился. Экзамен не запущен.');
      return;
    }
    fullscreenWasEntered = true;
  }
  examStarted = true;
  $('startGate').hidden = true;
  $('examApp').hidden = false;
  if (isExamMode()) document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('beforeunload', handleBeforeUnload);
  beginAttempt();
}

function showStartError(message) {
  $('startStatus').textContent = message;
  $('startStatus').className = 'editor-status error';
  $('startExamBtn').disabled = false;
}

function beginAttempt() {
  attemptKey = 'testBaseAttempt:' + testId;
  const saved = sessionStorage.getItem(attemptKey);
  if (saved) {
    try {
      const attempt = JSON.parse(saved);
      if (attempt && Array.isArray(attempt.questions) && attempt.questions.length && attempt.deadline > Date.now()) {
        questions = attempt.questions;
        answers = attempt.answers || {};
        currentIndex = Math.min(attempt.currentIndex || 0, questions.length - 1);
        warningCount = attempt.warningCount || 0;
        violationLog = attempt.violationLog || [];
        deadline = attempt.deadline;
        startedAt = attempt.startedAt || new Date().toISOString();
      }
    } catch (error) {
      sessionStorage.removeItem(attemptKey);
    }
  }
  if (!questions.length) {
    const mode = testConfig.questionCountMode || 'fixed';
    let requested;
    if (mode === 'all') requested = questionBank.length;
    else if (mode === 'random') {
      const min = Math.max(1, Math.min(questionBank.length, Number(testConfig.questionCountMin) || 1));
      const max = Math.max(min, Math.min(questionBank.length, Number(testConfig.questionCountMax) || questionBank.length));
      requested = Math.floor(Math.random() * (max - min + 1)) + min;
    } else requested = Math.max(1, Number(testConfig.questionCount) || questionBank.length);

    const source = testConfig.shuffleQuestions === false ? [...questionBank] : shuffle([...questionBank]);
    questions = source.slice(0, Math.min(requested, questionBank.length)).map(prepareQuestion);
    answers = {};
    currentIndex = 0;
    warningCount = 0;
    violationLog = [];
    startedAt = new Date().toISOString();
    deadline = Date.now() + Math.max(1, Number(testConfig.timeMinutes) || 15) * 60 * 1000;
    saveAttempt();
  }
  remainingSeconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  $('testTitle').textContent = testConfig.title;
  $('testDescription').textContent = testConfig.description || 'Ответьте на вопросы и завершите тест.';
  $('testCategory').textContent = (testConfig.category || 'ТЕСТ').toUpperCase();
  $('integrityBanner').hidden = !isExamMode();
  updateWarningDisplay();
  render();
  startTimer();
}

function prepareQuestion(question) {
  const type = question.type || 'single';
  const source = Array.isArray(question.answers) ? question.answers : [];
  const multiCorrect = new Set(question.correctAnswers || []);
  const answers = source.map((answer, index) => {
    const answerObject = typeof answer === 'string' ? {text:answer} : answer;
    const correctByType = type === 'multiple' ? multiCorrect.has(index) : index === Number(question.correct ?? 0);
    return {
      text: answerObject?.text || '',
      image: answerObject?.image || '',
      correct: typeof answerObject?.correct === 'boolean' ? answerObject.correct : correctByType,
      originalIndex: index
    };
  });
  return {
    ...question,
    type,
    answers: testConfig.shuffleAnswers === false ? answers : shuffle(answers)
  };
}

function shuffle(items) {
  for (let index = items.length - 1; index > 0; index--) {
    const j = Math.floor(Math.random() * (index + 1));
    [items[index], items[j]] = [items[j], items[index]];
  }
  return items;
}

function saveAttempt() {
  if (!attemptKey || submitting) return;
  sessionStorage.setItem(attemptKey, JSON.stringify({
    questions, answers, currentIndex, warningCount, violationLog, deadline, startedAt
  }));
}

function handleFullscreenChange() {
  if (!examStarted || !fullscreenWasEntered || document.fullscreenElement || submitting) return;
  finish(true, 'Экзамен автоматически завершён: выход из полноэкранного режима.');
}

function handleVisibilityChange() {
  if (!examStarted || submitting || !isExamMode()) return;
  if (document.visibilityState === 'hidden') {
    warningCount++;
    violationLog.push({type:'tab-hidden', at:new Date().toISOString(), count:warningCount});
    const limit = Math.max(1, Number(testConfig.security?.maxWarnings) || 2);
    if (warningCount >= limit && testConfig.security?.finishOnLimit !== false) pendingAutoFinish = true;
    updateWarningDisplay();
    saveAttempt();
    return;
  }
  updateWarningDisplay();
  if (pendingAutoFinish && !submitting) {
    pendingAutoFinish = false;
    finish(true, 'Экзамен автоматически завершён: превышен лимит переключений вкладки.');
  }
}

function updateWarningDisplay() {
  const limit = Math.max(1, Number(testConfig.security?.maxWarnings) || 2);
  $('warningCounter').textContent = 'Нарушения: ' + warningCount + '/' + limit;
  $('integrityBanner').classList.toggle('integrity-warning', warningCount > 0);
}

function handleBeforeUnload(event) {
  if (!submitting) {
    event.preventDefault();
    event.returnValue = '';
  }
}

function render() {
  const question = questions[currentIndex];
  if (!question) return;
  const type = question.type || 'single';
  $('questionNumber').textContent = 'ВОПРОС ' + String(currentIndex + 1).padStart(2, '0');
  $('questionText').textContent = question.question || '';
  $('questionTypeBadge').textContent = type === 'multiple' ? 'НЕСКОЛЬКО ОТВЕТОВ' : type === 'text' ? 'СВОБОДНЫЙ ОТВЕТ' : 'ОДИН ОТВЕТ';
  const media = safeImageSource(question.image);
  $('questionMedia').hidden = !media;
  $('questionMedia').innerHTML = media ? '<img src="' + escapeAttribute(media) + '" alt="' + escapeAttribute(question.imageAlt || 'Иллюстрация к вопросу') + '">' : '';
  $('questionHint').textContent = type === 'multiple' ? 'Выберите все правильные варианты ответа.' : type === 'text' ? 'Введите ответ в текстовое поле.' : 'Выберите один правильный вариант ответа.';

  if (type === 'text') {
    const value = typeof answers[question.id] === 'string' ? answers[question.id] : '';
    $('answerList').innerHTML = '<div class="free-answer-wrap"><label for="freeAnswer" class="field-label">Ваш ответ</label><textarea id="freeAnswer" class="field-control field-textarea free-answer" rows="4" placeholder="Введите ответ...">' + escapeHtml(value) + '</textarea></div>';
    $('freeAnswer').addEventListener('input', event => {
      answers[question.id] = event.target.value;
      saveAttempt();
      updateProgress();
      updateNavigation();
    });
  } else {
    const multiple = type === 'multiple';
    const selected = Array.isArray(answers[question.id]) ? answers[question.id] : [];
    const selectedSingle = answers[question.id];
    $('answerList').innerHTML = question.answers.map((answer,index) => {
      const isSelected = multiple ? selected.includes(index) : selectedSingle === index;
      const answerImage = safeImageSource(answer.image);
      const content = (answer.text ? '<span class="answer-text">' + escapeHtml(answer.text) + '</span>' : '') +
        (answerImage ? '<img class="answer-media" src="' + escapeAttribute(answerImage) + '" alt="Изображение варианта ответа">' : '');
      if (multiple) return '<label class="answer-option answer-multiple ' + (isSelected ? 'selected' : '') + '"><input type="checkbox" data-index="' + index + '" ' + (isSelected ? 'checked' : '') + '><span class="answer-letter">' + String.fromCharCode(65 + index) + '</span><span class="answer-content">' + content + '</span></label>';
      return '<button type="button" class="answer-option ' + (isSelected ? 'selected' : '') + '" data-index="' + index + '"><span class="answer-letter">' + String.fromCharCode(65 + index) + '</span><span class="answer-content">' + content + '</span></button>';
    }).join('');
    if (multiple) {
      $('answerList').querySelectorAll('input[type="checkbox"]').forEach(input => input.addEventListener('change', () => {
        const value = Array.isArray(answers[question.id]) ? [...answers[question.id]] : [];
        const index = Number(input.dataset.index);
        answers[question.id] = input.checked ? [...new Set([...value,index])] : value.filter(item => item !== index);
        saveAttempt();
        render();
      }));
    } else {
      $('answerList').querySelectorAll('.answer-option').forEach(button => button.addEventListener('click', () => {
        answers[question.id] = Number(button.dataset.index);
        saveAttempt();
        render();
      }));
    }
  }

  $('prevBtn').disabled = currentIndex === 0;
  $('prevBtn').style.opacity = currentIndex === 0 ? '.45' : '1';
  $('nextBtn').textContent = currentIndex === questions.length - 1 ? 'К результатам →' : 'Следующий вопрос →';
  updateProgress();
  updateNavigation();
}

function updateProgress() {
  const answered = questions.filter(isAnswered).length;
  const unanswered = questions.length - answered;
  $('progressText').textContent = 'Вопрос ' + (currentIndex + 1) + ' из ' + questions.length;
  $('answeredText').textContent = 'Отвечено: ' + answered;
  $('unansweredText').textContent = 'Без ответа: ' + unanswered;
  $('progressBar').style.width = (answered / questions.length * 100) + '%';
}

function updateNavigation() {
  $('questionNav').innerHTML = questions.map((item,index) =>
    '<button type="button" class="nav-question ' + (index === currentIndex ? 'current ' : '') + (isAnswered(item) ? 'answered' : 'unanswered') + '" data-index="' + index + '" aria-label="Вопрос ' + (index + 1) + '">' + (index + 1) + '</button>'
  ).join('');
  $('questionNav').querySelectorAll('button').forEach(button => button.addEventListener('click', () => goTo(Number(button.dataset.index))));
}

function isAnswered(question) {
  const value = answers[question.id];
  if (question.type === 'text') return typeof value === 'string' && value.trim().length > 0;
  if (question.type === 'multiple') return Array.isArray(value) && value.length > 0;
  return Number.isInteger(value);
}

function goTo(index) {
  if (index < 0 || index >= questions.length) return;
  currentIndex = index;
  saveAttempt();
  render();
}

function startTimer() {
  updateTimer();
  timerId = setInterval(() => {
    remainingSeconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    updateTimer();
    if (remainingSeconds <= 0) finish(true, 'Время тестирования истекло.');
  }, 500);
}

function updateTimer() {
  const minutes = Math.floor(remainingSeconds / 60), seconds = remainingSeconds % 60;
  $('timer').textContent = String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
  $('timer').style.color = remainingSeconds <= 60 ? '#d94d55' : '';
}

function isCorrect(question) {
  const chosen = answers[question.id];
  if (question.type === 'text') {
    if (typeof chosen !== 'string') return false;
    const normalize = value => String(value).trim().toLocaleLowerCase('ru-RU').replace(/\s+/g,' ');
    const normalized = normalize(chosen);
    return (question.acceptedAnswers || []).some(value => question.caseSensitive ? String(value).trim() === chosen.trim() : normalize(value) === normalized);
  }
  if (question.type === 'multiple') {
    if (!Array.isArray(chosen) || !chosen.length) return false;
    const expected = question.answers.map((answer,index) => answer.correct ? index : -1).filter(index => index >= 0).sort((a,b)=>a-b);
    const actual = [...chosen].sort((a,b)=>a-b);
    return expected.length === actual.length && expected.every((value,index) => value === actual[index]);
  }
  return Number.isInteger(chosen) && Boolean(question.answers[chosen]?.correct);
}

async function finish(automatic, reason = '') {
  if (submitting) return;
  const unanswered = questions.filter(question => !isAnswered(question)).length;
  if (!automatic && unanswered > 0 && !confirm('Осталось без ответа: ' + unanswered + '. Завершить тест?')) return;
  if (!automatic && !confirm('Вы уверены, что хотите завершить тест? Изменить ответы после этого будет нельзя.')) return;
  submitting = true;
  clearInterval(timerId);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  document.removeEventListener('fullscreenchange', handleFullscreenChange);
  window.removeEventListener('beforeunload', handleBeforeUnload);
  const correct = questions.filter(isCorrect).length;
  const percent = Math.round(correct / questions.length * 100);
  const passPercent = Math.min(100, Math.max(1, Number(testConfig.passPercent) || 60));
  const grade = percent >= 90 ? '5' : percent >= 70 ? '4' : percent >= 50 ? '3' : '2';
  const result = {
    id: makeId(), testId, title: testConfig.title, correct, total: questions.length,
    percent, grade, passPercent, passed: percent >= passPercent,
    autoFinished: automatic, reason, warningCount, violationLog,
    startedAt, finishedAt: new Date().toISOString()
  };
  sessionStorage.setItem('testBaseResult', JSON.stringify(result));
  sessionStorage.removeItem(attemptKey);
  if (document.fullscreenElement) {
    try { await document.exitFullscreen(); } catch (error) { console.warn('Не удалось выйти из полноэкранного режима:', error); }
  }
  location.href = 'result.html?v=20261118-2225';
}

function makeId() {
  return 'attempt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8);
}

function safeImageSource(source) {
  const value = String(source || '').trim();
  if (/^data:image\/(png|jpeg|webp|gif);base64,/i.test(value)) return value;
  if (/^(https?:\/\/|\.\.?\/|images\/|assets\/)/i.test(value)) return value;
  return '';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
}
function escapeAttribute(value) { return escapeHtml(value); }

$('prevBtn').addEventListener('click', () => goTo(currentIndex - 1));
$('nextBtn').addEventListener('click', () => {
  if (currentIndex === questions.length - 1) finish(false);
  else goTo(currentIndex + 1);
});
$('finishBtn').addEventListener('click', () => finish(false));
document.addEventListener('keydown', event => {
  if (event.key === 'ArrowRight') goTo(currentIndex + 1);
  if (event.key === 'ArrowLeft') goTo(currentIndex - 1);
});
init();