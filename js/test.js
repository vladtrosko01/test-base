const params=new URLSearchParams(location.search);
const testId=params.get('id');
let testConfig=null,questions=[],answers={},currentIndex=0,timerId=null,remainingSeconds=0,submitting=false;
const $=id=>document.getElementById(id);
async function init(){
  try{
    const [testsResponse,questionsResponse]=await Promise.all([fetch('data/tests.json'),fetch('data/questions.json')]);
    if(!testsResponse.ok||!questionsResponse.ok)throw new Error('Не удалось загрузить базу тестов');
    const testsData=await testsResponse.json(),questionsData=await questionsResponse.json();
    testConfig=(testsData.tests||[]).find(t=>t.id===testId);
    if(!testConfig)throw new Error('Тест не найден');
    const bank=(questionsData.questions||[]).filter(q=>q.testId===testId);
    if(!bank.length)throw new Error('В этом тесте пока нет вопросов');
    const requested=Math.max(1,Number(testConfig.questionCount)||bank.length);
    questions=shuffle([...bank]).slice(0,Math.min(requested,bank.length)).map(q=>({...q,answers:shuffle(q.answers.map((text,index)=>({text,correct:index===q.correct}))) }));
    answers={};currentIndex=0;remainingSeconds=Math.max(1,Number(testConfig.timeMinutes)||15)*60;
    $('testTitle').textContent=testConfig.title;$('testDescription').textContent=testConfig.description||'Ответьте на вопросы и завершите тест.';$('testCategory').textContent=(testConfig.category||'ТЕСТ').toUpperCase();
    render();startTimer();
    $('prevBtn').addEventListener('click',()=>goTo(currentIndex-1));
    $('nextBtn').addEventListener('click',()=>goTo(currentIndex+1));
    $('finishBtn').addEventListener('click',()=>finish(false));
    document.addEventListener('keydown',e=>{if(e.key==='ArrowRight')goTo(currentIndex+1);if(e.key==='ArrowLeft')goTo(currentIndex-1);});
    window.addEventListener('beforeunload',e=>{if(!submitting){e.preventDefault();e.returnValue='';}});
  }catch(error){document.querySelector('.question-layout').innerHTML='<div class="empty-state">'+safe(error.message)+'</div>';console.error(error);}
}
function shuffle(items){for(let i=items.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[items[i],items[j]]=[items[j],items[i]];}return items;}
function render(){
  const q=questions[currentIndex];if(!q)return;
  $('questionNumber').textContent='ВОПРОС '+String(currentIndex+1).padStart(2,'0');
  $('questionText').textContent=q.question;
  $('progressText').textContent='Вопрос '+(currentIndex+1)+' из '+questions.length;
  $('answeredText').textContent='Отвечено: '+Object.keys(answers).length;
  $('progressBar').style.width=((currentIndex+1)/questions.length*100)+'%';
  $('answerList').innerHTML=q.answers.map((answer,index)=>`<button type="button" class="answer-option ${answers[q.id]===index?'selected':''}" data-index="${index}"><span class="answer-letter">${String.fromCharCode(65+index)}</span><span>${safe(answer.text)}</span></button>`).join('');
  $('answerList').querySelectorAll('.answer-option').forEach(button=>button.addEventListener('click',()=>{answers[q.id]=Number(button.dataset.index);render();}));
  $('prevBtn').disabled=currentIndex===0;$('prevBtn').style.opacity=currentIndex===0?'.45':'1';
  $('nextBtn').textContent=currentIndex===questions.length-1?'К результатам →':'Следующий вопрос →';
  $('questionNav').innerHTML=questions.map((item,index)=>`<button class="nav-question ${index===currentIndex?'current':''} ${answers[item.id]!==undefined?'answered':''}" data-index="${index}" aria-label="Вопрос ${index+1}">${index+1}</button>`).join('');
  $('questionNav').querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>goTo(Number(button.dataset.index))));
}
function goTo(index){if(index<0||index>=questions.length)return;currentIndex=index;render();}
function startTimer(){updateTimer();timerId=setInterval(()=>{remainingSeconds--;updateTimer();if(remainingSeconds<=0)finish(true);},1000);}
function updateTimer(){const m=Math.floor(remainingSeconds/60),s=remainingSeconds%60;$('timer').textContent=String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');$('timer').style.color=remainingSeconds<=60?'#d94d55':'';}
function finish(timeUp){
  if(submitting)return;
  const unanswered=questions.length-Object.keys(answers).length;
  if(!timeUp&&unanswered>0&&!confirm('Осталось без ответа: '+unanswered+'. Завершить тест?'))return;
  if(!timeUp&&!confirm('Вы уверены, что хотите завершить тест? Изменить ответы после этого будет нельзя.'))return;
  submitting=true;clearInterval(timerId);
  let correct=0;
  questions.forEach(q=>{const chosen=answers[q.id];if(chosen!==undefined&&q.answers[chosen].correct)correct++;});
  const percent=Math.round(correct/questions.length*100);
  let grade=percent>=90?'5':percent>=70?'4':percent>=50?'3':'2';
  const result={title:testConfig.title,correct,total:questions.length,percent,grade,timeUp,finishedAt:new Date().toISOString()};
  sessionStorage.setItem('testBaseResult',JSON.stringify(result));
  location.href='result.html';
}
function safe(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
init();