(() => {
  const $ = id => document.getElementById(id);
  let tests = [], questions = [], changeCount = 0, ready = false;

  async function init() {
    try {
      const [testsResponse, questionsResponse] = await Promise.all([fetch('data/tests.json'), fetch('data/questions.json')]);
      if (!testsResponse.ok || !questionsResponse.ok) throw new Error('Не удалось загрузить JSON-файлы. Проверьте GitHub Pages.');
      const testsData = await testsResponse.json(), questionsData = await questionsResponse.json();
      tests = Array.isArray(testsData.tests) ? testsData.tests : [];
      questions = Array.isArray(questionsData.questions) ? questionsData.questions : [];
      if (!tests.length) throw new Error('В tests.json пока нет тестов.');
      normalizeTests();
      fillTests(); fillSettingsTests(); loadSelectedSettings(); renderQuestions(); updateStats();
      ready = true;
      $('downloadQuestions').disabled = false; $('downloadTests').disabled = false;
      setStatus('База загружена. Можно редактировать вопросы.', 'success');
      setSettingsStatus('Настройки загружены.', 'success');
      $('questionForm').addEventListener('submit', addQuestion);
      $('questionSearch').addEventListener('input', renderQuestions);
      $('downloadQuestions').addEventListener('click', downloadQuestions);
      $('downloadTests').addEventListener('click', downloadTests);
      $('settingsTestSelect').addEventListener('change', loadSelectedSettings);
      $('questionCountMode').addEventListener('change', showCountFields);
      $('settingsForm').addEventListener('submit', saveSettings);
      $('examMode').addEventListener('change', () => { if (!$('examMode').checked) $('fullscreenRequired').checked = false; });
    } catch (error) {
      setStatus(error.message, 'error'); setSettingsStatus(error.message, 'error');
      $('questionList').innerHTML = '<div class="empty-state">' + escapeHtml(error.message) + '</div>';
    }
  }

  function normalizeTests() {
    tests.forEach(test => {
      test.questionCountMode ||= 'random';
      test.questionCountMin = Number(test.questionCountMin) || 3;
      test.questionCountMax = Number(test.questionCountMax) || Number(test.questionCount) || 5;
      test.timeMinutes = Number(test.timeMinutes) || 10;
      test.passPercent = Number.isFinite(Number(test.passPercent)) ? Number(test.passPercent) : 60;
      if (typeof test.shuffleQuestions !== 'boolean') test.shuffleQuestions = true;
      if (typeof test.shuffleAnswers !== 'boolean') test.shuffleAnswers = true;
      if (typeof test.examMode !== 'boolean') test.examMode = test.security?.enabled !== false;
      test.security ||= {};
      test.security.enabled = test.examMode;
      test.security.maxWarnings = Number(test.security.maxWarnings) || 2;
      test.security.finishOnLimit = test.security.finishOnLimit !== false;
      if (typeof test.security.fullscreenRequired !== 'boolean') test.security.fullscreenRequired = true;
    });
  }

  function fillTests() {
    $('testSelect').innerHTML = tests.map(test => '<option value="' + escapeHtml(test.id) + '">' + escapeHtml(test.title) + '</option>').join('');
  }
  function fillSettingsTests() {
    $('settingsTestSelect').innerHTML = tests.map(test => '<option value="' + escapeHtml(test.id) + '">' + escapeHtml(test.title) + '</option>').join('');
  }
  function selectedTest() { return tests.find(test => test.id === $('settingsTestSelect').value); }

  function loadSelectedSettings() {
    const test = selectedTest(); if (!test) return;
    $('questionCountMode').value = test.questionCountMode || 'random';
    $('questionCount').value = test.questionCount || 5;
    $('questionCountMin').value = test.questionCountMin || 3;
    $('questionCountMax').value = test.questionCountMax || test.questionCount || 5;
    $('timeMinutes').value = test.timeMinutes || 10;
    $('passPercent').value = test.passPercent ?? 60;
    $('maxWarnings').value = test.security?.maxWarnings || 2;
    $('shuffleQuestions').checked = test.shuffleQuestions !== false;
    $('shuffleAnswers').checked = test.shuffleAnswers !== false;
    $('examMode').checked = test.examMode !== false;
    $('fullscreenRequired').checked = test.security?.fullscreenRequired !== false;
    showCountFields();
  }

  function showCountFields() {
    const mode = $('questionCountMode').value;
    $('fixedCountGroup').hidden = mode !== 'fixed';
    $('randomMinGroup').hidden = mode !== 'random';
    $('randomMaxGroup').hidden = mode !== 'random';
  }

  function saveSettings(event) {
    event.preventDefault(); if (!ready) return;
    const test = selectedTest(); if (!test) return;
    const mode = $('questionCountMode').value;
    const time = Number($('timeMinutes').value), pass = Number($('passPercent').value), warnings = Number($('maxWarnings').value);
    const fixed = Number($('questionCount').value), min = Number($('questionCountMin').value), max = Number($('questionCountMax').value);
    if (!Number.isInteger(time) || time < 1 || time > 600) return setSettingsStatus('Время должно быть от 1 до 600 минут.', 'error');
    if (!Number.isInteger(pass) || pass < 1 || pass > 100) return setSettingsStatus('Проходной процент должен быть от 1 до 100.', 'error');
    if (!Number.isInteger(warnings) || warnings < 1 || warnings > 20) return setSettingsStatus('Количество нарушений должно быть от 1 до 20.', 'error');
    if (mode === 'fixed' && (!Number.isInteger(fixed) || fixed < 1 || fixed > 1000)) return setSettingsStatus('Укажите фиксированное количество от 1 до 1000.', 'error');
    if (mode === 'random' && (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min || max > 1000)) return setSettingsStatus('Проверьте диапазон случайного количества вопросов.', 'error');

    test.questionCountMode = mode;
    test.questionCount = mode === 'fixed' ? fixed : (test.questionCount || 5);
    test.questionCountMin = mode === 'random' ? min : (test.questionCountMin || 3);
    test.questionCountMax = mode === 'random' ? max : (test.questionCountMax || 5);
    test.timeMinutes = time; test.passPercent = pass;
    test.shuffleQuestions = $('shuffleQuestions').checked;
    test.shuffleAnswers = $('shuffleAnswers').checked;
    test.examMode = $('examMode').checked;
    test.security = { ...(test.security || {}), enabled: test.examMode, maxWarnings: warnings, finishOnLimit: true, fullscreenRequired: test.examMode && $('fullscreenRequired').checked };
    changeCount++; updateStats();
    setSettingsStatus('Настройки сохранены в редакторе. Скачайте tests.json, чтобы опубликовать их.', 'success');
  }

  function addQuestion(event) {
    event.preventDefault(); if (!ready) return;
    const testId = $('testSelect').value, questionText = $('questionInput').value.trim();
    const answers = [0,1,2,3].map(index => $('answer' + index).value.trim());
    const correct = Number($('correctSelect').value);
    if (!tests.some(test => test.id === testId)) return setStatus('Выберите существующий тест.', 'error');
    if (!questionText || answers.some(answer => !answer)) return setStatus('Заполните вопрос и все четыре варианта.', 'error');
    questions.push({ id: createId(), testId, question: questionText, answers, correct });
    changeCount++; $('questionForm').reset(); renderQuestions(); updateStats();
    setStatus('Вопрос добавлен. Скачайте questions.json, чтобы сохранить изменение.', 'success');
  }

  function removeQuestion(id) {
    if (!questions.some(question => question.id === id)) return;
    if (!confirm('Удалить этот вопрос из подготовленной базы?')) return;
    questions = questions.filter(question => question.id !== id);
    changeCount++; renderQuestions(); updateStats();
    setStatus('Вопрос удалён из редактора. Скачайте questions.json для публикации.', 'success');
  }

  function renderQuestions() {
    const query = $('questionSearch').value.trim().toLowerCase();
    const filtered = questions.filter(question => {
      const test = tests.find(item => item.id === question.testId);
      return (question.question + ' ' + (test?.title || '')).toLowerCase().includes(query);
    });
    if (!filtered.length) { $('questionList').innerHTML = '<div class="empty-state">Вопросы не найдены.</div>'; return; }
    $('questionList').innerHTML = filtered.map(question => {
      const test = tests.find(item => item.id === question.testId), correctText = question.answers?.[question.correct] ?? 'Не указан';
      return '<article class="bank-question"><div class="bank-question-top"><span class="category-pill">' + escapeHtml(test?.title || question.testId) + '</span><button type="button" class="delete-question" data-delete="' + escapeHtml(question.id) + '">Удалить</button></div><h3>' + escapeHtml(question.question) + '</h3><p class="correct-answer">Правильный ответ: ' + escapeHtml(correctText) + '</p><div class="bank-answer-preview">' + (question.answers || []).map((answer,index) => '<span class="' + (index === question.correct ? 'is-correct' : '') + '">' + String.fromCharCode(65+index) + '. ' + escapeHtml(answer) + '</span>').join('') + '</div></article>';
    }).join('');
    $('questionList').querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', () => removeQuestion(button.dataset.delete)));
  }

  function updateStats() { $('adminTestCount').textContent=tests.length; $('adminQuestionCount').textContent=questions.length; $('adminChangesCount').textContent=changeCount; }

  function downloadFile(name, data) {
    const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function downloadQuestions() { if (ready) { downloadFile('questions.json', { questions }); setStatus('Файл questions.json скачан. Загрузите его в data в GitHub.', 'success'); } }
  function downloadTests() { if (ready) { downloadFile('tests.json', { tests }); setSettingsStatus('Файл tests.json скачан. Загрузите его в data в GitHub.', 'success'); } }
  function createId() {
    let id; do { id='q_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7); } while(questions.some(question=>question.id===id)); return id;
  }
  function setStatus(message,type) { $('editorStatus').textContent=message; $('editorStatus').className='editor-status '+(type||''); }
  function setSettingsStatus(message,type) { $('settingsStatus').textContent=message; $('settingsStatus').className='editor-status '+(type||''); }
  function escapeHtml(value) { return String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character])); }
  init();
})();