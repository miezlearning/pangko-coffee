async function importOrders(e){
  e.preventDefault();
  const fileEl = document.getElementById('file');
  const methodEl = document.getElementById('method');
  const statusEl = document.getElementById('status');
  const resultEl = document.getElementById('result');
  if (!fileEl.files[0]) return;
  statusEl.textContent = 'Uploading…';
  resultEl.classList.add('hidden');
  const fd = new FormData();
  fd.append('file', fileEl.files[0]);
  if (methodEl.value) fd.append('method', methodEl.value);
  try {
    const res = await fetch('/api/import/orders', { method:'POST', body: fd });
    const data = await res.json();
    if (data.success){
      statusEl.textContent = '';
      resultEl.innerHTML = `✅ Berhasil import ${data.imported} orders.`;
      resultEl.classList.remove('hidden');
    } else {
      statusEl.textContent = '';
      resultEl.innerHTML = `❌ Gagal: ${data.message || 'Unknown error'}`;
      resultEl.classList.remove('hidden');
    }
  } catch (e){
    statusEl.textContent = '';
    resultEl.innerHTML = `❌ Error: ${e.message}`;
    resultEl.classList.remove('hidden');
  }
}

window.addEventListener('DOMContentLoaded', ()=>{
  const form = document.getElementById('import-form');
  form?.addEventListener('submit', importOrders);
});
