async function loadCatalog(){
  const grid=document.getElementById('testGrid');
  try{
    const response=await fetch('data/tests.json');
    if(!response.ok) throw new Error('Не удалось загрузить каталог');
    const data=await response.json();
    window.testCatalog=data.tests||[];
    fillCategories(window.testCatalog);
    renderCatalog(window.testCatalog);
    document.getElementById('searchInput').addEventListener('input',applyFilters);
    document.getElementById('categoryFilter').addEventListener('change',applyFilters);
  }catch(error){grid.innerHTML='<div class="empty-state">Не удалось загрузить каталог. Проверьте наличие файла data/tests.json.</div>';console.error(error);}
}
function fillCategories(tests){
  const select=document.getElementById('categoryFilter');
  [...new Set(tests.map(t=>t.category).filter(Boolean))].sort().forEach(category=>{
    const option=document.createElement('option');option.value=category;option.textContent=category;select.append(option);
  });
}
function applyFilters(){
  const query=document.getElementById('searchInput').value.trim().toLowerCase();
  const category=document.getElementById('categoryFilter').value;
  const filtered=window.testCatalog.filter(t=>(!category||t.category===category)&&(!query||(t.title+' '+t.description+' '+t.category).toLowerCase().includes(query)));
  renderCatalog(filtered);
}
function renderCatalog(tests){
  const grid=document.getElementById('testGrid');
  document.getElementById('testCount').textContent='Найдено: '+tests.length;
  if(!tests.length){grid.innerHTML='<div class="empty-state">По вашему запросу ничего не найдено.</div>';return;}
  grid.innerHTML=tests.map(test=>`
    <article class="test-card">
      <div class="card-top"><span class="category-pill">${escapeHTML(test.category||'ОБЩЕЕ')}</span><span class="card-code">${escapeHTML(test.code||test.id)}</span></div>
      <h3>${escapeHTML(test.title)}</h3><p>${escapeHTML(test.description||'Проверка знаний по выбранной теме.')}</p>
      <div class="card-meta"><span>◷ ${Number(test.timeMinutes)||15} мин.</span><span>▤ ${Number(test.questionCount)||'Случайное число'} вопросов</span></div>
      <a class="button button-primary card-button" href="test.html?id=${encodeURIComponent(test.id)}">Начать тест</a>
    </article>`).join('');
}
function escapeHTML(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
loadCatalog();