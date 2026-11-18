(() => {
  const $ = id => document.getElementById(id);
  let tests = [];
  let questions = [];
  let changeCount = 0;
  let ready = false;

  async function init() {
    try {
      const [testsResponse, questionsResponse] = await Promise.all([
        fetch('data/tests.json'),
        fetch('data/questions.json')
      ]);
      if (!testsResponse.ok || !questionsResponse.ok) {
        throw new Error('Не удалось загрузить JSON-файлы. Проверьте публикацию GitHub Pages.');
      }
      const testsData = await testsResponse.json();
      const questionsData = await questionsResponse.json();
      tests = Array.isArray(testsData.tests) ? testsData.tests : [];
      questions = Array.isArray(questionsData.questions) ? questionsData.questions : [];
      if (!tests.length) throw new Error('В tests.json пока нет ни одного теста.');
      fillTests();
      renderQuestions();
      updateStats();
      ready = true;
      $('downloadQuestions').disabled = false;
      setStatus('База загружена. Можно добавлять и удалять вопросы.', 'success');
      $('questionForm').addEventListener('submit', addQuestion);
      $('questionSearch').addEventListener('input', renderQuestions);
      $('downloadQuestions').addEventListener('click', downloadJson);
    } catch (error) {
      setStatus(error.message, 'error');
      $('questionList').innerHTML = '<div class="empty-state">' + escapeHtml(error.message) + '</div>';
    }
  }

  function fillTests() {
    $('testSelect').innerHTML = tests.map(test =>
      '<option value="' + escapeHtml(test.id) + '">' + escapeHtml(test.title) + '</option>'
    ).join('');
  }

  function addQuestion(event) {
    event.preventDefault();
    if (!ready) return;
    const testId = $('testSelect').value;
    const questionText = $('questionInput').value.trim();
    const answers = [0, 1, 2, 3].map(index => $('answer' + index).value.trim());
    const correct = Number($('correctSelect').value);
    if (!tests.some(test => test.id === testId)) {
      setStatus('Выберите существующий тест.', 'error');
      return;
    }
    if (!questionText || answers.some(answer => !answer)) {
      setStatus('Заполните вопрос и все четыре варианта ответа.', 'error');
      return;
    }
    const id = createId();
    questions.push({ id, testId, question: questionText, answers, correct });
    changeCount++;
    $('questionForm').reset();
    renderQuestions();
    updateStats();
    setStatus('Вопрос добавлен в текущую редакторскую сессию. Не забудьте скачать JSON.', 'success');
  }

  function removeQuestion(id) {
    const item = questions.find(question => question.id === id);
    if (!item) return;
    if (!confirm('Удалить этот вопрос из подготовленной базы?')) return;
    questions = questions.filter(question => question.id !== id);
    changeCount++;
    renderQuestions();
    updateStats();
    setStatus('Вопрос удалён из текущей редакторской сессии. Скачайте JSON, чтобы сохранить изменение.', 'success');
  }

  function renderQuestions() {
    const query = $('questionSearch').value.trim().toLowerCase();
    const filtered = questions.filter(question => {
      const test = tests.find(item => item.id === question.testId);
      return (question.question + ' ' + (test?.title || '')).toLowerCase().includes(query);
    });
    if (!filtered.length) {
      $('questionList').innerHTML = '<div class="empty-state">Вопросы не найдены.</div>';
      return;
    }
    $('questionList').innerHTML = filtered.map(question => {
      const test = tests.find(item => item.id === question.testId);
      const correctText = question.answers?.[question.correct] ?? 'Не указан';
      return '<article class="bank-question">' +
        '<div class="bank-question-top"><span class="category-pill">' + escapeHtml(test?.title || question.testId) + '</span>' +
        '<button type="button" class="delete-question" data-delete="' + escapeHtml(question.id) + '" aria-label="Удалить вопрос">Удалить</button></div>' +
        '<h3>' + escapeHtml(question.question) + '</h3>' +
        '<p class="correct-answer">Правильный ответ: ' + escapeHtml(correctText) + '</p>' +
        '<div class="bank-answer-preview">' + (question.answers || []).map((answer, index) =>
          '<span class="' + (index === question.correct ? 'is-correct' : '') + '">' + String.fromCharCode(65 + index) + '. ' + escapeHtml(answer) + '</span>'
        ).join('') + '</div></article>';
    }).join('');
    $('questionList').querySelectorAll('[data-delete]').forEach(button =>
      button.addEventListener('click', () => removeQuestion(button.dataset.delete))
    );
  }

  function updateStats() {
    $('adminTestCount').textContent = tests.length;
    $('adminQuestionCount').textContent = questions.length;
    $('adminChangesCount').textContent = changeCount;
  }

  function downloadJson() {
    if (!ready) return;
    const payload = JSON.stringify({ questions }, null, 2) + '\n';
    const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'questions.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus('Файл questions.json подготовлен. Загрузите его в папку data репозитория.', 'success');
  }

  function createId() {
    let id;
    do {
      id = 'q_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
    } while (questions.some(question => question.id === id));
    return id;
  }

  function setStatus(message, type) {
    $('editorStatus').textContent = message;
    $('editorStatus').className = 'editor-status ' + (type || '');
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  init();
})();