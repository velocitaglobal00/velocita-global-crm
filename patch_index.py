import re
P = r"C:\Users\isabe\Desktop\VELOCITA GLOBAL\08 Sistemas e Projetos\site-velocita\index.html"
s = open(P, encoding="utf-8").read()

brand = ('<span class="brand"><img src="assets/logo-oficial.png" alt="" class="brand-img" width="797" height="655" />'
         '<span class="brand-name">VELOCITA<b>GLOBAL</b></span></span>')

s = s.replace('<a href="#inicio" aria-label="Velocita Global, início"><img src="assets/logo-claro.svg" alt="Velocita Global" /></a>',
              '<a href="#inicio" class="brand-link" aria-label="Velocita Global, início">' + brand + '</a>', 1)
s = s.replace('      <img src="assets/logo-claro.svg" alt="Velocita Global" />', '      ' + brand, 1)
s = s.replace('<body>\n', '<body>\n<div class="progress" aria-hidden="true"></div>\n', 1)
s = s.replace('</main>\n\n<footer', '</main>\n\n<a href="#inicio" class="to-top" aria-label="Voltar ao topo">&#8593;</a>\n\n<footer', 1)

js = """<script>
  // barra de progresso, botão de voltar ao topo e revelação ao rolar
  const progress = document.querySelector('.progress');
  const toTop = document.querySelector('.to-top');
  const onScroll = () => {
    const h = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = 'scaleX(' + (h > 0 ? scrollY / h : 0) + ')';
    toTop.classList.toggle('show', scrollY > 700);
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  document.querySelectorAll('.section-head, .card, .step, .plan, .value, .client, .contact-item, .lead-form, .metric').forEach((el, i) => {
    el.classList.add('rv');
    el.style.transitionDelay = ((i % 3) * 90) + 'ms';
  });
  const io = new IntersectionObserver((entries) => entries.forEach((en) => {
    if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
  }), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.rv').forEach((el) => io.observe(el));

  // menu no celular"""
assert s.count("<script>\n  // menu no celular") == 1
s = s.replace("<script>\n  // menu no celular", js, 1)
open(P, "w", encoding="utf-8").write(s)
print("brand:", s.count("brand-img"), "rv:", s.count("rv'"), "to-top:", s.count("to-top"), "logo-claro:", s.count("logo-claro"))
