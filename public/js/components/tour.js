/**
 * Combustível Certo · Tutorial guiado: escurece a tela, destaca uma parte e diz o que ela faz
 */
const Tour = (() => {
  let steps = [];
  let i = 0;
  let busy = false;
  let veil, hole, box, frame, onEnd;

  // steps: [{ target, title, text, prep?, open?, below? }]; prep pode esperar e devolver false para pular o passo
  function start(list, done) {
    if (veil || !list.length) return;
    steps = list;
    onEnd = done;
    veil = Object.assign(document.createElement("div"), { className: "tour-veil" });
    hole = Object.assign(document.createElement("div"), { className: "tour-hole" });
    box = Object.assign(document.createElement("div"), { className: "tour-box" });
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-labelledby", "tourTitle");
    box.setAttribute("aria-describedby", "tourText");
    document.body.append(veil, hole, box);
    document.body.classList.add("tour-on");

    veil.addEventListener("click", end);
    box.addEventListener("click", (e) => {
      const go = e.target.closest("[data-tour]")?.dataset.tour;
      if (go === "next") show(i + 1, 1);
      else if (go === "back") show(i - 1, -1);
      else if (go === "skip") end();
    });
    document.addEventListener("keydown", onKey);
    show(0, 1);
  }

  function onKey(e) {
    if (e.key === "Escape") end();
    else if (e.key === "ArrowRight") show(i + 1, 1);
    else if (e.key === "ArrowLeft") show(i - 1, -1);
  }

  const isVisible = (el) => {
    const r = el?.getBoundingClientRect();
    return !!r && r.width > 0 && r.bottom > 0 && r.top < innerHeight;
  };

  async function show(n, dir) {
    if (busy || !veil || n < 0) return;
    if (n >= steps.length) return end();
    busy = true;
    document.querySelector(".tip:popover-open")?.hidePopover();
    const s = steps[n];
    const ok = s.prep ? (await s.prep()) !== false : true;
    busy = false;
    if (!veil) return;
    const target = document.querySelector(s.target);
    if (!ok || !isVisible(target)) return show(n + dir, dir);

    i = n;
    box.innerHTML = `
      <h3 id="tourTitle">${UI.esc(s.title)}</h3>
      <p id="tourText">${UI.esc(s.text)}</p>
      <div class="tour-nav">
        <small>${n + 1} de ${steps.length}</small>
        <button type="button" class="link" data-tour="skip">Pular</button>
        ${n > 0 ? '<button type="button" class="btn btn-quiet btn-sm" data-tour="back">Voltar</button>' : ""}
        <button type="button" class="btn btn-primary btn-sm" data-tour="next">${n === steps.length - 1 ? "Concluir" : "Próximo"}</button>
      </div>`;
    box.querySelector('[data-tour="next"]').focus();
    s.open?.(target);
    cancelAnimationFrame(frame);
    place();
  }

  // Acompanha o alvo a cada quadro: o mapa voa, a folha desliza e o conteúdo é redesenhado
  function place() {
    if (!veil) return;
    const s = steps[i];
    const r = document.querySelector(s.target)?.getBoundingClientRect();
    if (r) {
      const pad = 6;
      Object.assign(hole.style, {
        top: r.top - pad + "px",
        left: r.left - pad + "px",
        width: r.width + pad * 2 + "px",
        height: r.height + pad * 2 + "px",
      });
      const w = box.offsetWidth;
      const h = box.offsetHeight;
      const below = r.bottom + pad + 12;
      const above = r.top - pad - 12 - h;
      const fitsBelow = below + h <= innerHeight - 16;
      const top = (s.below || above < 16) && fitsBelow ? below : above >= 16 ? above : Math.max(16, innerHeight - h - 16);
      box.style.top = top + "px";
      box.style.left = Math.max(16, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 16)) + "px";
    }
    frame = requestAnimationFrame(place);
  }

  function end() {
    if (!veil) return;
    cancelAnimationFrame(frame);
    document.removeEventListener("keydown", onKey);
    document.querySelector(".tip:popover-open")?.hidePopover();
    veil.remove();
    hole.remove();
    box.remove();
    veil = hole = box = null;
    document.body.classList.remove("tour-on");
    onEnd?.();
  }

  return { start };
})();
