/* One user-initiated explanation controls narration and its scientific diagram. */
(() => {
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.documentElement;
  const motionToggle = document.querySelector('[data-motion-toggle]');
  let motionEnabled = !preference.matches;
  let active = null;
  let expanded = null;
  const canAnimate = () => motionEnabled && !preference.matches;

  // Expand the existing player in place: the live audio element never moves.
  function closeExpanded(returnFocus = true) {
    if (!expanded) return;
    const state = expanded;
    expanded = null;
    state.player.element.classList.remove('diagram-expanded');
    for (const [name, value] of Object.entries(state.attributes)) {
      if (value === null) state.player.element.removeAttribute(name);
      else state.player.element.setAttribute(name, value);
    }
    state.background.forEach(({node, inert, ariaHidden}) => {
      if (inert === null) node.removeAttribute('inert');
      else node.setAttribute('inert', inert);
      if (ariaHidden === null) node.removeAttribute('aria-hidden');
      else node.setAttribute('aria-hidden', ariaHidden);
    });
    state.player.expand.hidden = false;
    state.player.expand.setAttribute('aria-expanded', 'false');
    if (state.viewer) for (const [name, value] of Object.entries(state.viewerAttributes)) {
      if (value === null) state.viewer.removeAttribute(name);
      else state.viewer.setAttribute(name, value);
    }
    state.header.remove();
    state.hint.remove();
    state.placeholder.remove();
    state.backdrop.remove();
    document.body.classList.remove('diagram-open');
    if (returnFocus) state.player.expand.focus({preventScroll: true});
  }

  function openExpanded(player) {
    if (expanded?.player === player) { expanded.close.focus(); return; }
    closeExpanded(false);
    const element = player.element;
    const placeholder = document.createElement('div');
    placeholder.className = 'diagram-placeholder';
    placeholder.setAttribute('aria-hidden', 'true');
    placeholder.style.height = `${element.getBoundingClientRect().height}px`;
    element.parentElement.insertBefore(placeholder, element);
    const backdrop = document.createElement('div');
    backdrop.className = 'diagram-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    document.body.append(backdrop);
    const header = document.createElement('div');
    header.className = 'diagram-dialog-header';
    const title = document.createElement('h2');
    title.id = 'diagram-expanded-title';
    title.className = 'diagram-dialog-title';
    title.textContent = player.title;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'diagram-dialog-close';
    close.textContent = 'Close';
    close.setAttribute('aria-label', `Close expanded diagram for ${player.title}`);
    header.append(title, close);
    element.insertBefore(header, element.firstChild);
    const hint = document.createElement('p');
    hint.className = 'diagram-zoom-hint';
    hint.id = 'diagram-expanded-hint';
    hint.textContent = 'Scroll horizontally to explore the enlarged diagram.';
    element.insertBefore(hint, header.nextSibling);
    const viewer = element.querySelector('.pane-viewer');
    const viewerAttributes = viewer ? Object.fromEntries(['tabindex', 'aria-label', 'aria-describedby'].map(name => [name, viewer.getAttribute(name)])) : {};
    if (viewer) {
      viewer.setAttribute('tabindex', '0');
      viewer.setAttribute('aria-label', `Enlarged diagram for ${player.title}`);
      viewer.setAttribute('aria-describedby', hint.id);
    }
    const attributes = Object.fromEntries(['role', 'aria-modal', 'aria-labelledby', 'tabindex'].map(name => [name, element.getAttribute(name)]));
    const background = [];
    // Hide sibling branches, keeping the player's ancestors accessible.
    for (let node = element; node && node !== document.body; node = node.parentElement) {
      for (const sibling of node.parentElement?.children || []) {
        if (sibling === node || sibling === backdrop) continue;
        background.push({node: sibling, inert: sibling.getAttribute('inert'), ariaHidden: sibling.getAttribute('aria-hidden')});
        sibling.setAttribute('inert', '');
        sibling.setAttribute('aria-hidden', 'true');
      }
    }
    expanded = {player, placeholder, backdrop, header, hint, close, viewer, viewerAttributes, attributes, background};
    element.setAttribute('role', 'dialog');
    element.setAttribute('aria-modal', 'true');
    element.setAttribute('aria-labelledby', title.id);
    element.setAttribute('tabindex', '-1');
    element.classList.add('diagram-expanded');
    player.expand.hidden = true;
    player.expand.setAttribute('aria-expanded', 'true');
    document.body.classList.add('diagram-open');
    player.updateTiming();
    close.addEventListener('click', () => closeExpanded());
    backdrop.addEventListener('click', () => closeExpanded());
    close.focus({preventScroll: true});
  }

  document.addEventListener('keydown', event => {
    if (!expanded) return;
    if (event.key === 'Escape') { event.preventDefault(); closeExpanded(); return; }
    if (event.key !== 'Tab') return;
    const element = expanded.player.element;
    const controls = [...element.querySelectorAll('button,a[href],audio[controls],[tabindex]')].filter(control => !control.disabled && !control.hidden && control.getAttribute('tabindex') !== '-1' && !control.closest('[hidden]') && control.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (!first) { event.preventDefault(); element.focus(); return; }
    if (!element.contains(document.activeElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  });
  document.addEventListener('focusin', event => {
    if (expanded && !expanded.player.element.contains(event.target)) expanded.close.focus();
  });

  const players = [...document.querySelectorAll('[data-explanation]')].map(element => {
    const article = element.closest('article');
    const title = article.querySelector('h3').textContent;
    const play = element.querySelector('[data-play]');
    const next = element.querySelector('[data-next]');
    const replay = element.querySelector('[data-replay]');
    const progress = element.querySelector('[data-progress]');
    const expand = element.querySelector('[data-expand]');
    const status = element.querySelector('[data-audio-status]');
    const audio = element.querySelector('audio.paper-audio');
    const elapsedTime = element.querySelector('[data-time-elapsed]');
    const remainingTime = element.querySelector('[data-time-remaining]');
    const totalTime = element.querySelector('[data-time-total]');
    const measuredSeconds = Number(element.dataset.duration);
    const measuredDuration = Number.isFinite(measuredSeconds) && measuredSeconds > 0 ? measuredSeconds : null;
    const steps = [...element.querySelectorAll('.animation-stages li')];
    const groups = [...element.querySelectorAll('.science-svg [data-step]')];
    const panes = [...element.querySelectorAll('[data-method-pane]')];
    const paneButtons = [...element.querySelectorAll('[data-pane-choose]')];
    const paneSteps = panes.map(pane => pane.dataset.paneSteps.split(',').map(Number));
    const transcripts = [...article.querySelectorAll('[data-transcript-step]')];
    const starts = steps.map(step => Number(step.dataset.stageStart));
    const cueStarts = starts.length && starts[0] === 0 && starts.every((time, i) => Number.isFinite(time) && (!i || time > starts[i - 1])) ? starts : null;
    let desiredPlaying = false, finished = false, started = false;
    let request = 0, pendingRequest = 0, pendingFraction = null, pendingSeconds = null, seekInFlight = null;
    let fraction = 0, stage = 0, paneIndex = 0, frame = 0, lastTime = 0;
    const duration = () => audio && Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null;
    const announce = message => { if (status) status.textContent = message; };

    function updateTiming() {
      if (!elapsedTime && !remainingTime && !totalTime) return;
      const total = duration() ?? measuredDuration;
      let elapsed = audio && Number.isFinite(audio.currentTime) ? Math.max(0, audio.currentTime) : 0;
      if (pendingFraction !== null) elapsed = pendingSeconds ?? (total === null ? 0 : pendingFraction * total);
      if (total !== null) elapsed = Math.min(total, Math.max(0, elapsed));
      const ended = finished || Boolean(audio?.ended);
      if (ended && total !== null) elapsed = total;
      const format = (value, roundUp = false) => {
        if (value === null || !Number.isFinite(value)) return '—';
        const seconds = Math.max(0, roundUp ? Math.ceil(value) : Math.floor(value));
        return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
      };
      if (elapsedTime) elapsedTime.textContent = format(elapsed, ended);
      if (remainingTime) remainingTime.textContent = total === null ? '—' : format(Math.max(0, total - elapsed), true);
      if (totalTime) totalTime.textContent = format(total, true);
    }

    function paint(value, selectedStage = null) {
      fraction = Math.max(0, Math.min(1, value));
      updateTiming();
      if (!steps.length) return;
      stage = selectedStage ?? Math.min(steps.length - 1, Math.floor(fraction * steps.length + 1e-7));
      steps.forEach((step, i) => {
        step.classList.toggle('active', i === stage);
        if (i === stage) step.setAttribute('aria-current', 'step');
        else step.removeAttribute('aria-current');
      });
      groups.forEach(group => group.classList.toggle('active', Number(group.dataset.step) === stage));
      if (panes.length) {
        paneIndex = Math.max(0, paneSteps.findIndex(indices => indices.includes(stage)));
        panes.forEach((pane, i) => { pane.hidden = i !== paneIndex; });
        paneButtons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === paneIndex)));
      }
      transcripts.forEach(part => {
        const current = Number(part.dataset.transcriptStep) === stage;
        part.classList.toggle('active', current);
        if (current) part.setAttribute('aria-current', 'step');
        else part.removeAttribute('aria-current');
      });
      if (progress) progress.textContent = panes.length ? `${paneIndex + 1} / ${panes.length}` : `${stage + 1} / ${steps.length}`;
    }

    function synchronize() {
      const label = desiredPlaying ? 'Pause explanation' : finished ? 'Play again' : started ? 'Resume explanation' : 'Play explanation';
      play.textContent = label;
      play.setAttribute('aria-label', `${label} for ${title}`);
      play.setAttribute('aria-pressed', String(desiredPlaying));
      element.classList.toggle('running', desiredPlaying && canAnimate() && steps.length > 0);
      element.classList.toggle('stepping', started && !desiredPlaying && steps.length > 0);
      updateTiming();
    }

    function applyPendingSeek() {
      if (!audio || pendingFraction === null || !duration()) return;
      const target = pendingSeconds ?? pendingFraction * duration();
      if (Math.abs(audio.currentTime - target) < 0.05 && !audio.seeking) {
        pendingFraction = null; pendingSeconds = null; seekInFlight = null;
        return;
      }
      if (audio.seeking && seekInFlight === target) return;
      if (target > 0 && audio.seekable && !Array.from({length: audio.seekable.length}, (_, i) => i).some(i => audio.seekable.start(i) <= target && audio.seekable.end(i) >= target)) return;
      try {
        audio.currentTime = target; seekInFlight = target;
        if (Math.abs(audio.currentTime - target) < 0.05 && !audio.seeking) {
          pendingFraction = null; pendingSeconds = null; seekInFlight = null;
        }
      } catch { /* A later metadata event will retry the requested stage. */ }
    }

    function seek(value, selectedStage = null) {
      paint(value, selectedStage);
      if (audio) {
        pendingFraction = value;
        pendingSeconds = cueStarts && selectedStage !== null ? cueStarts[selectedStage] : value === 0 ? 0 : null;
        applyPendingSeek();
      }
      updateTiming();
    }

    function syncFromAudio() {
      if (audio && pendingFraction === null && duration()) {
        // Each boundary is measured from the corresponding spoken section's PCM frames.
        const current = cueStarts ? cueStarts.reduce((index, time, i) => time <= audio.currentTime + 0.0001 ? i : index, 0) : null;
        paint(audio.currentTime / duration(), current);
      }
      updateTiming();
    }

    function pause(message = 'Explanation paused.') {
      const wasPlaying = desiredPlaying || (audio && !audio.paused);
      ++request;
      pendingRequest = 0;
      desiredPlaying = false;
      if (audio) audio.pause();
      cancelAnimationFrame(frame); lastTime = 0;
      if (active === api) active = null;
      synchronize();
      if (wasPlaying) announce(message);
    }

    function complete() {
      ++request; pendingRequest = 0; desiredPlaying = false; finished = true;
      cancelAnimationFrame(frame); lastTime = 0;
      if (canAnimate()) paint(1);
      if (active === api) active = null;
      synchronize(); announce('Explanation finished.');
    }

    function claimPlayback() {
      if (expanded && expanded.player !== api) { closeExpanded(false); play.focus(); }
      if (active && active !== api) active.pause();
      active = api;
    }

    function fallback() {
      pause();
      element.classList.add('audio-fallback');
      announce('Audio could not start. Try Play again or use the audio controls below.');
    }

    // Papers without a recording can still use the same visual controls.
    function tick(now) {
      if (!desiredPlaying || audio || !canAnimate()) return;
      if (lastTime) fraction += (now - lastTime) / 9000;
      lastTime = now; paint(fraction);
      if (fraction >= 1) { complete(); return; }
      frame = requestAnimationFrame(tick);
    }

    function start(reset = false) {
      claimPlayback();
      if (reset || finished || (audio && audio.ended)) seek(0);
      applyPendingSeek();
      finished = false; started = true; desiredPlaying = true;
      const currentRequest = ++request;
      pendingRequest = currentRequest;
      synchronize();
      if (!audio) {
        pendingRequest = 0; lastTime = 0;
        if (canAnimate()) frame = requestAnimationFrame(tick);
        else { pause('Motion is disabled. Use Next stage to explore the diagram.'); }
        return;
      }
      announce('Loading explanation…');
      // Invoke play in the click event so the browser recognizes the user gesture.
      let playback;
      try { playback = audio.play(); }
      catch { if (currentRequest === request && desiredPlaying) fallback(); return; }
      Promise.resolve(playback).then(() => {
        if (currentRequest !== request || !desiredPlaying) return;
        if (document.hidden || audio.paused) { pause(); return; }
        syncFromAudio(); announce('Playing explanation.');
      }).catch(() => {
        // Canceled or superseded requests must not overwrite a newer playback state.
        if (currentRequest === request && desiredPlaying) fallback();
      }).finally(() => {
        if (pendingRequest === currentRequest) pendingRequest = 0;
      });
    }

    function showPane(index) {
      pause(); started = true; finished = false;
      const target = paneSteps[index][0];
      seek(target / steps.length, target);
      synchronize(); announce(`Pane ${paneIndex + 1} of ${panes.length}. Explanation paused.`);
    }

    function advance() {
      if (panes.length) { showPane((paneIndex + 1) % panes.length); return; }
      pause(); started = true; finished = false;
      const target = (stage + 1) % steps.length;
      seek(target / steps.length, target);
      synchronize(); announce(`Stage ${stage + 1} of ${steps.length}. Explanation paused.`);
    }

    const api = { element, article, title, expand, pause, updateTiming, motionChanged() {
      synchronize();
      if (desiredPlaying && canAnimate()) {
        if (audio) syncFromAudio();
        else { lastTime = 0; cancelAnimationFrame(frame); frame = requestAnimationFrame(tick); }
      } else { cancelAnimationFrame(frame); lastTime = 0; }
    } };
    play.addEventListener('click', () => desiredPlaying || (audio && !audio.paused) ? pause() : start());
    if (next) next.addEventListener('click', advance);
    paneButtons.forEach((button, i) => button.addEventListener('click', () => showPane(i)));
    replay.addEventListener('click', () => start(true));
    if (expand && groups.length) {
      expand.hidden = false;
      expand.addEventListener('click', () => openExpanded(api));
    }

    if (audio) {
      audio.autoplay = false;
      ['loadedmetadata', 'durationchange', 'canplay', 'progress'].forEach(event => audio.addEventListener(event, () => { applyPendingSeek(); syncFromAudio(); }));
      audio.addEventListener('timeupdate', syncFromAudio);
      audio.addEventListener('seeked', () => {
        applyPendingSeek();
        if (finished && !audio.ended) { finished = false; synchronize(); }
        syncFromAudio();
      });
      audio.addEventListener('play', () => {
        if (audio.paused) return;
        if (document.hidden) { pause(); return; }
        if (!desiredPlaying && !element.classList.contains('audio-fallback')) { audio.pause(); return; }
        // Visible native controls own their requests, including a quick pause/resume.
        if (element.classList.contains('audio-fallback')) { ++request; pendingRequest = 0; }
        claimPlayback(); desiredPlaying = true; started = true; finished = false;
        synchronize(); syncFromAudio(); announce('Playing explanation.');
      });
      audio.addEventListener('pause', () => {
        if (!audio.paused || (desiredPlaying && pendingRequest === request && !element.classList.contains('audio-fallback'))) return;
        if (element.classList.contains('audio-fallback')) { ++request; pendingRequest = 0; }
        const wasPlaying = desiredPlaying;
        desiredPlaying = false;
        if (active === api) active = null;
        synchronize();
        if (wasPlaying && !audio.ended) announce('Explanation paused.');
      });
      audio.addEventListener('ended', () => { if (audio.ended) complete(); });
      audio.addEventListener('error', fallback);
    }
    element.classList.add('explanation-ready');
    paint(0); synchronize();
    return api;
  });

  function syncMotion() {
    root.classList.toggle('motion-off', !canAnimate());
    if (motionToggle) {
      motionToggle.disabled = preference.matches;
      motionToggle.textContent = preference.matches ? 'Reduced motion' : motionEnabled ? 'Pause motion' : 'Enable motion';
      motionToggle.setAttribute('aria-pressed', String(canAnimate()));
    }
    players.forEach(player => player.motionChanged());
  }
  if (motionToggle) motionToggle.addEventListener('click', () => { motionEnabled = !motionEnabled; syncMotion(); });
  preference.addEventListener('change', () => { motionEnabled = !preference.matches; syncMotion(); });
  syncMotion();

  // Keep narration available while the reader moves from a diagram to its summary.
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (!entry.isIntersecting && expanded?.player.article !== entry.target) players.find(player => player.article === entry.target)?.pause();
  }), { threshold: 0.01 });
  players.forEach(player => observer.observe(player.article));
  const motif = document.querySelector('.observation-study');
  if (motif) new IntersectionObserver(entries => entries.forEach(entry => motif.classList.toggle('motif-offscreen', !entry.isIntersecting)), { threshold: 0.01 }).observe(motif);
  document.addEventListener('visibilitychange', () => {
    root.classList.toggle('tab-inactive', document.hidden);
    if (document.hidden) players.forEach(player => player.pause());
  });
  window.addEventListener('pagehide', () => players.forEach(player => player.pause()));
  document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
    const text = button.parentElement.querySelector('pre').textContent;
    try { await navigator.clipboard.writeText(text); button.textContent = 'Copied'; }
    catch { button.textContent = 'Select the citation below'; }
    setTimeout(() => button.textContent = 'Copy BibTeX', 2500);
  }));
})();
