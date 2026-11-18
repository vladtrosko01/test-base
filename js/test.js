const params=new URLSearchParams(location.search);
const testId=params.get('id');
let testConfig=null,questionBank=[],questions=[],answers={},currentIndex=0,timerId=null,remainingSeconds=0,submitting=false,warningCount=0,attemptKey='',deadline=0,violationLog=[],pendingAutoFinish=false,examStarted=false,fullscreenWasEntered=false;
const $=id=>document.getElementById(id);

async function init(){
  try{
    const [testsResponse,questionsResponse]=await Promise.all([fetch('data/tests.json'),fetch('data/questions.json')]);
    if(!testsResponse.ok||!questionsResponse.ok)throw new Error('Не удалось загрузить базу тестов');
    const testsData=await testsResponse.json(),questionsData=await questionsResponse.json();
    testConfig=(testsData.tests||[]).find(test=>test.id===testId);
    if(!testConfig)throw new Error('Тест не найден');
    questionBank=(questionsData.questions||[]).filter(question=>question.testId===testId);
    if(!questionBank.length)throw new Error('В этом тесте пока нет вопросов');
    $('startTestTitle').textContent=testConfig.title;
    $('startTestDescription').textContent=testConfig.description||'Проверьте настройки перед началом.';
    const mode=testConfig.questionCountMode||'fixed';
    const questionLabel=mode==='all'?'Все вопросы банка':mode==='random'?'Случайное количество: '+(testConfig.questionCountMin||3)+'–'+(testConfig.questionCountMax||questionBank.length):'Вопросов: '+(testConfig.questionCount||questionBank.length);
    $('startDetails').innerHTML='<span>◷ '+Number(testConfig.timeMinutes||15)+' минут</span><span>▤ '+escapeHtml(questionLabel)+'</span><span>Проходной балл: '+Number(testConfig.passPercent??60)+'%</span>';
    const security=testConfig.security||{};
    const requireFullscreen=isExamMode()&&security.fullscreenRequired!==false;
    $('startFullscreenNote').hidden=!requireFullscreen;
    $('startExamBtn').textContent=requireFullscreen?'Войти в полноэкранный режим и начать':'Начать тест';
    $('startExamBtn').disabled=false;
    $('startStatus').textContent=requireFullscreen?'Нажмите кнопку, чтобы начать экзамен в полноэкранном режиме.':'Нажмите кнопку, чтобы начать тест.';
    $('startExamBtn').addEventListener('click',startExam);
  }catch(error){
    $('startTestTitle').textContent='Не удалось открыть тест';
    $('startStatus').textContent=error.message;
    $('startStatus').className='editor-status error';
  }
}

function isExamMode(){return testConfig?.examMode??testConfig?.security?.enabled??true;}

async function startExam(){
  const button=$('startExamBtn');
  if(button.disabled||examStarted)return;
  button.disabled=true;
  $('startStatus').textContent='Переходим в полноэкранный режим...';
  const requireFullscreen=isExamMode()&&(testConfig.security?.fullscreenRequired!==false);
  if(requireFullscreen){
    if(!document.documentElement.requestFullscreen){
      $('startStatus').textContent='Этот браузер не поддерживает полноэкранный режим. Откройте сайт в актуальном Chrome или Edge на компьютере.';
      $('startStatus').className='editor-status error';button.disabled=false;return;
    }
    try{
      await document.documentElement.requestFullscreen();
    }catch(error){
      $('startStatus').textContent='Браузер не разрешил полноэкранный режим. Нажмите кнопку ещё раз или проверьте разрешения браузера.';
      $('startStatus').className='editor-status error';button.disabled=false;return;
    }
    if(!document.fullscreenElement){
      $('startStatus').textContent='Полноэкранный режим не был включён. Экзамен не запущен.';
      $('startStatus').className='editor-status error';button.disabled=false;return;
    }
    fullscreenWasEntered=true;
  }
  examStarted=true;
  $('startGate').hidden=true;$('examApp').hidden=false;
  if(fullscreenWasEntered)document.addEventListener('fullscreenchange',handleFullscreenChange);
  if(isExamMode())document.addEventListener('visibilitychange',handleVisibilityChange);
  window.addEventListener('beforeunload',handleBeforeUnload);
  beginAttempt();
}

function beginAttempt(){
  attemptKey='testBaseAttempt:'+testId;
  const saved=sessionStorage.getItem(attemptKey);
  if(saved){
    try{
      const attempt=JSON.parse(saved);
      if(attempt&&Array.isArray(attempt.questions)&&attempt.questions.length&&attempt.deadline>Date.now()){
        questions=attempt.questions;answers=attempt.answers||{};currentIndex=Math.min(attempt.currentIndex||0,questions.length-1);
        warningCount=attempt.warningCount||0;violationLog=attempt.violationLog||[];deadline=attempt.deadline;
      }
    }catch(error){sessionStorage.removeItem(attemptKey);}
  }
  if(!questions.length){
    const mode=testConfig.questionCountMode||'fixed';
    let requested;
    if(mode==='all')requested=questionBank.length;
    else if(mode==='random'){
      const min=Math.max(1,Math.min(questionBank.length,Number(testConfig.questionCountMin)||1));
      const max=Math.max(min,Math.min(questionBank.length,Number(testConfig.questionCountMax)||questionBank.length));
      requested=Math.floor(Math.random()*(max-min+1))+min;
    }else requested=Math.max(1,Number(testConfig.questionCount)||questionBank.length);
    const selected=testConfig.shuffleQuestions===false?[...questionBank]:shuffle([...questionBank]);
    questions=selected.slice(0,Math.min(requested,questionBank.length)).map(question=>{
      const mapped=question.answers.map((text,index)=>({text,correct:index===question.correct}));
      return {...question,answers:testConfig.shuffleAnswers===false?mapped:shuffle(mapped)};
    });
    answers={};currentIndex=0;warningCount=0;violationLog=[];
    deadline=Date.now()+Math.max(1,Number(testConfig.timeMinutes)||15)*60*1000;
    saveAttempt();
  }
  remainingSeconds=Math.max(0,Math.ceil((deadline-Date.now())/1000));
  $('testTitle').textContent=testConfig.title;
  $('testDescription').textContent=testConfig.description||'Ответьте на вопросы и завершите тест.';
  $('testCategory').textContent=(testConfig.category||'ТЕСТ').toUpperCase();
  $('integrityBanner').hidden=!isExamMode();
  updateWarningDisplay();
  render();startTimer();
}

function shuffle(items){for(let index=items.length-1;index>0;index--){const j=Math.floor(Math.random()*(index+1));[items[index],items[j]]=[items[j],items[index]];}return items;}
function saveAttempt(){if(!attemptKey||submitting)return;sessionStorage.setItem(attemptKey,JSON.stringify({questions,answers,currentIndex,warningCount,violationLog,deadline}));}

function handleFullscreenChange(){
  if(!examStarted||!fullscreenWasEntered||document.fullscreenElement||submitting)return;
  finish(true,'Экзамен автоматически завершён: выход из полноэкранного режима.');
}
function handleVisibilityChange(){
  if(submitting||!isExamMode())return;
  if(document.visibilityState==='hidden'){
    warningCount++;
    violationLog.push({type:'tab-hidden',at:new Date().toISOString(),count:warningCount});
    const limit=Math.max(1,Number(testConfig.security?.maxWarnings)||2);
    if(warningCount>=limit&&testConfig.security?.finishOnLimit!==false)pendingAutoFinish=true;
    saveAttempt();
    return;
  }
  updateWarningDisplay();
  if(pendingAutoFinish&&!submitting){
    pendingAutoFinish=false;
    finish(true,'Экзамен автоматически завершён: превышен лимит переключений вкладки.');
  }
}
function updateWarningDisplay(){
  const limit=Math.max(1,Number(testConfig.security?.maxWarnings)||2);
  $('warningCounter').textContent='Нарушения: '+warningCount+'/'+limit;
  $('integrityBanner').classList.toggle('integrity-warning',warningCount>0);
}
function handleBeforeUnload(event){if(!submitting){event.preventDefault();event.returnValue='';}}

function render(){
  const question=questions[currentIndex];if(!question)return;
  $('questionNumber').textContent='ВОПРОС '+String(currentIndex+1).padStart(2,'0');
  $('questionText').textContent=question.question;
  $('progressText').textContent='Вопрос '+(currentIndex+1)+' из '+questions.length;
  $('answeredText').textContent='Отвечено: '+Object.keys(answers).length;
  $('progressBar').style.width=((currentIndex+1)/questions.length*100)+'%';
  $('answerList').innerHTML=question.answers.map((answer,index)=>'<button type="button" class="answer-option '+(answers[question.id]===index?'selected':'')+'" data-index="'+index+'"><span class="answer-letter">'+String.fromCharCode(65+index)+'</span><span>'+escapeHtml(answer.text)+'</span></button>').join('');
  $('answerList').querySelectorAll('.answer-option').forEach(button=>button.addEventListener('click',()=>{answers[question.id]=Number(button.dataset.index);saveAttempt();render();}));
  $('prevBtn').disabled=currentIndex===0;$('prevBtn').style.opacity=currentIndex===0?'.45':'1';
  $('nextBtn').textContent=currentIndex===questions.length-1?'К результатам →':'Следующий вопрос →';
  $('questionNav').innerHTML=questions.map((item,index)=>'<button class="nav-question '+(index===currentIndex?'current ':'')+(answers[item.id]!==undefined?'answered':'')+'" data-index="'+index+'" aria-label="Вопрос '+(index+1)+'">'+(index+1)+'</button>').join('');
  $('questionNav').querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>goTo(Number(button.dataset.index))));
}

function goTo(index){if(index<0||index>=questions.length)return;currentIndex=index;saveAttempt();render();}
function startTimer(){updateTimer();timerId=setInterval(()=>{remainingSeconds=Math.max(0,Math.ceil((deadline-Date.now())/1000));updateTimer();if(remainingSeconds<=0)finish(true,'Время тестирования истекло.');},500);}
function updateTimer(){const minutes=Math.floor(remainingSeconds/60),seconds=remainingSeconds%60;$('timer').textContent=String(minutes).padStart(2,'0')+':'+String(seconds).padStart(2,'0');$('timer').style.color=remainingSeconds<=60?'#d94d55':'';}

async function finish(automatic,reason=''){
  if(submitting)return;
  const unanswered=questions.length-Object.keys(answers).length;
  if(!automatic&&unanswered>0&&!confirm('Осталось без ответа: '+unanswered+'. Завершить тест?'))return;
  if(!automatic&&!confirm('Вы уверены, что хотите завершить тест? Изменить ответы после этого будет нельзя.'))return;
  submitting=true;clearInterval(timerId);
  document.removeEventListener('visibilitychange',handleVisibilityChange);
  document.removeEventListener('fullscreenchange',handleFullscreenChange);
  window.removeEventListener('beforeunload',handleBeforeUnload);
  let correct=0;
  questions.forEach(question=>{const chosen=answers[question.id];if(chosen!==undefined&&question.answers[chosen].correct)correct++;});
  const percent=Math.round(correct/questions.length*100);
  const passPercent=Math.min(100,Math.max(1,Number(testConfig.passPercent)||60));
  const grade=percent>=90?'5':percent>=70?'4':percent>=50?'3':'2';
  const result={title:testConfig.title,correct,total:questions.length,percent,grade,passPercent,passed:percent>=passPercent,timeUp:automatic,reason,warningCount,violationLog,finishedAt:new Date().toISOString()};
  sessionStorage.setItem('testBaseResult',JSON.stringify(result));sessionStorage.removeItem(attemptKey);
  if(document.fullscreenElement){try{await document.exitFullscreen();}catch(error){console.warn('Не удалось выйти из полноэкранного режима:',error);}}
  location.href='result.html';
}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));}

$('prevBtn').addEventListener('click',()=>goTo(currentIndex-1));
$('nextBtn').addEventListener('click',()=>{if(currentIndex===questions.length-1)finish(false);else goTo(currentIndex+1);});
$('finishBtn').addEventListener('click',()=>finish(false));
document.addEventListener('keydown',event=>{if(event.key==='ArrowRight')goTo(currentIndex+1);if(event.key==='ArrowLeft')goTo(currentIndex-1);});
init();