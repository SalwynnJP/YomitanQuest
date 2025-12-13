// ================================
// CONFIGURATION & STATE
// ================================

const CONFIG = {
  RANGE_OPTIONS: [25, 50, 100, 250, 500, 1000],
  DEFAULT_RANGE_INDEX: 2,
  DEFAULT_CONQUEST_THRESHOLD: 80,
  DEFAULT_CONQUEST_SPACING: 10,
  MC_CHOICES_COUNT: 4
};

const state = {
  // Decks
  decks: [],
  selectedDeckIndices: [0],
  currentDeck: [],
  deckMetadata: [],
  originalDeck: [],
originalDeckMetadata: [],
  
  // Navigation
  currentIndex: 0,
  ranges: [],
  currentRangeIndex: 0,
  rangeSize: CONFIG.RANGE_OPTIONS[CONFIG.DEFAULT_RANGE_INDEX],
  
  // Modes
  isChoiceMode: false,
  isShuffleEnabled: true,
  conquestEnabled: false,
  
  // Progress tracking
  correctCount: 0,
  skippedCount: 0,
  originalRange: [],
  currentChoices: [],
  
  // Conquest mode
  conquestQueue: [],
  conquestStats: {},
  conquestThreshold: CONFIG.DEFAULT_CONQUEST_THRESHOLD,
  conquestSpacingModifier: CONFIG.DEFAULT_CONQUEST_SPACING,
  conquestSessionData: null,
  conquestShuffleSnapshot: false,
};


let conquestCountdownInterval = null;

// ================================
// INITIALIZATION
// ================================

function init() {
  loadDeckPaths();
  initDeckSelector();
  initEventListeners();
  initButtonListeners();

  // --- AJOUTER CETTE LIGNE ICI ---
  const saveBtn = document.getElementById('saveConquestBtn');
  if (saveBtn) saveBtn.style.display = 'none';
  // -------------------------------

  loadCombinedDecks();

}

function loadDeckPaths() {
  const deckPaths = [
    "decks/常・音.csv", "decks/常・訓.csv", "decks/失敗.csv", "decks/付表.csv", 
    "decks/表外その1.csv", "decks/表外その2.csv", "decks/熟字訓.csv", "decks/宛字.csv", "decks/動当義.csv", 
    "decks/熟字訓その1.csv", "decks/熟字訓その2.csv", "decks/湯・重箱.csv",
    "decks/仮名vb.csv", "decks/仮名adj.csv", "decks/助動.csv",
    "decks/干支その1.csv", "decks/干支その2.csv", "decks/節気.csv", "decks/年齢.csv", 
    "decks/擬音.csv", "decks/熟語その1.csv", "decks/熟語その2.csv",
    "decks/四その1.csv", "decks/四その2.csv", "decks/四その3.csv",
    "decks/諺その1.csv", "decks/諺その2.csv", "decks/諺その3.csv", "decks/諺その4.csv","decks/名字.csv",
    "decks/all.csv", "decks/二字.csv", "decks/三字.csv", "decks/四字.csv",
    "decks/準1級読み.csv", "decks/1級訓読み.csv", "decks/誤字訂正.csv", "decks/書取り.csv",
    "decks/同音・同訓.csv", "decks/類語・対義語.csv", "decks/送り仮名.csv", "decks/熟語構成.csv", "decks/二級四字熟語.csv","decks/部首.csv"
  ];
  
  // Default mode QCM
  const qcmRequiredDecks = [
    '擬音', '熟字訓その2', '熟語その1', '熟語その2', 
    '四その1', '四その2', '四その3',
    '諺その1', '諺その2', '諺その3', '諺その4',
    '誤字訂正', '書取り',
    '同音・同訓', '類語・対義語', 
    '送り仮名', '熟語構成', '部首', '二級四字熟語'
  ];
  
  state.decks = deckPaths.map(path => {
    const name = path.split('/').pop().replace('.csv', '');
    return {
      name: name,
      path: path,
      requiresQCM: qcmRequiredDecks.includes(name)
    };
  });
}

// ================================
// DECK MANAGEMENT
// ================================

function initDeckSelector() {
  const container = document.getElementById('deckCheckboxes');
  if (!container) return;
  
  container.innerHTML = state.decks.map((deck, i) => `
    <label style="display: block; margin: 5px 0;">
      <input type="checkbox" class="deck-checkbox" data-index="${i}" ${i === 0 ? 'checked' : ''}>
      <span style="margin-left: 5px;">${deck.name}</span>
    </label>
  `).join('');
}

function syncDeckCheckboxes() {
  document.querySelectorAll('.deck-checkbox').forEach((cb, i) => {
    cb.checked = state.selectedDeckIndices.includes(i);
  });
}

function applyDeckSelection() {
  const checkboxes = document.querySelectorAll('.deck-checkbox');
  state.selectedDeckIndices = Array.from(checkboxes)
    .filter(cb => cb.checked)
    .map(cb => parseInt(cb.dataset.index));

  if (state.selectedDeckIndices.length === 0) {
    alert('⚠️ Select at least one deck!');
    return;
  }

  loadCombinedDecks();
  toggleDeckSelector();
  
}

function resetDeckSelection() {
  state.selectedDeckIndices = [0];
  document.querySelectorAll('.deck-checkbox').forEach((cb, i) => {
    cb.checked = (i === 0);
  });
  syncDeckCheckboxes();
  loadCombinedDecks();
  toggleDeckSelector();
}

async function loadCombinedDecks() {
  // Reset propre
  resetProgress();
  state.currentDeck = [];
  state.deckMetadata = [];
  
  // --- CHARGEMENT DES CSV ---
  const loadPromises = state.selectedDeckIndices.map(async (index) => {
    const deck = state.decks[index];
    if (deck.customData) {
        deck.customData.forEach(q => {
            state.currentDeck.push(q);
            state.deckMetadata.push({ deckIndex: index, deckName: deck.name, requiresQCM: deck.requiresQCM });
        });
        return;
    }
    const response = await fetch(chrome.runtime.getURL(deck.path));
    const csv = await response.text();
    Papa.parse(csv, {
        header: true, skipEmptyLines: true,
        complete: results => {
            results.data.forEach(q => {
                state.currentDeck.push(q);
                state.deckMetadata.push({ deckIndex: index, deckName: deck.name, requiresQCM: deck.requiresQCM });
            });
        }
    });
  });
  await Promise.all(loadPromises);
  // -------------------------------------------

  if (state.selectedDeckIndices.length > 1) interleaveDecks();

  // Sauvegarde de référence
  state.originalDeck = state.currentDeck.map(q => ({...q}));
  state.originalDeckMetadata = [...state.deckMetadata];

// Gestion QCM
  const hasQCM = state.selectedDeckIndices.some(i => state.decks[i].requiresQCM);
  
  if (state.selectedDeckIndices.length === 1) {
    // En mode single deck, forcer le mode selon les besoins du deck
    if (hasQCM) {
      state.isChoiceMode = true;
      document.getElementById('modeToggle').checked = true;
    } else {
      // Forcer le mode texte si le deck ne nécessite pas le QCM
      state.isChoiceMode = false;
      document.getElementById('modeToggle').checked = false;
    }
  }

  updateDeckDisplay();

  // === MODIFICATION ICI : On force le mode Classique ===
  generateRanges(state.currentDeck.length);
  state.currentRangeIndex = 0;
  state.currentIndex = state.ranges[0].start;
  if (state.isShuffleEnabled) shuffleCurrentRange();
  updateRangeLabel();
  showQuestion();
  
  // Unlock inputs
  const i1 = document.getElementById('answerInput');
  const i2 = document.getElementById('answerInput2');
  if(i1) i1.disabled = false;
  if(i2) i2.disabled = false;
}

function updateDeckDisplay() {
  const deckNames = state.selectedDeckIndices.length > 1 
    ? '統合'
    : state.decks[state.selectedDeckIndices[0]].name;
  
  document.getElementById('deckName').textContent = deckNames;
  
  const infoEl = document.getElementById('activeDeckInfo');
  if (infoEl) {
    infoEl.textContent = `Active: ${state.currentDeck.length} questions (${state.selectedDeckIndices.length} decks)`;
  }
}

function prevDeck() {
  if (state.selectedDeckIndices.length > 1) {
    alert('Multi-deck mode is active. Use the selector.');
    return;
  }
  
  const currentIndex = state.selectedDeckIndices[0];
  const newIndex = (currentIndex - 1 + state.decks.length) % state.decks.length;
  state.selectedDeckIndices = [newIndex];
  syncDeckCheckboxes();
  loadCombinedDecks();
}

function nextDeck() {
  if (state.selectedDeckIndices.length > 1) {
    alert('Multi-deck mode is active. Use the selector.');
    return;
  }
  
  const currentIndex = state.selectedDeckIndices[0];
  const newIndex = (currentIndex + 1) % state.decks.length;
  state.selectedDeckIndices = [newIndex];
  syncDeckCheckboxes();
  loadCombinedDecks();
}

// ================================
// DECK INTERLEAVING
// ================================

function interleaveDecks() {
  // Grouper les cartes par deck
  const deckGroups = {};
  state.selectedDeckIndices.forEach(idx => {
    deckGroups[idx] = [];
  });
  
  state.currentDeck.forEach((card, i) => {
    const deckIdx = state.deckMetadata[i].deckIndex;
    deckGroups[deckIdx].push({ card, metadata: state.deckMetadata[i] });
  });
  
  // Distribution équilibrée et intercalée
  const interleaved = [];
  const deckIndices = Object.keys(deckGroups).map(Number);
  const maxLength = Math.max(...deckIndices.map(idx => deckGroups[idx].length));
  
  for (let i = 0; i < maxLength; i++) {
    deckIndices.forEach(deckIdx => {
      if (deckGroups[deckIdx][i]) {
        interleaved.push(deckGroups[deckIdx][i]);
      }
    });
  }
  
  // Réappliquer dans currentDeck et deckMetadata
  state.currentDeck = interleaved.map(item => item.card);
  state.deckMetadata = interleaved.map(item => item.metadata);
}

// ================================
// RANGE MANAGEMENT
// ================================

function generateRanges(totalQuestions) {
  state.ranges = [];
  
  // "All" range
  state.ranges.push({
    name: 'all',
    start: 0,
    end: totalQuestions - 1
  });
  
  // Block ranges
  for (let i = 0; i < totalQuestions; i += state.rangeSize) {
    state.ranges.push({
      name: `${i + 1}–${Math.min(i + state.rangeSize, totalQuestions)}`,
      start: i,
      end: Math.min(i + state.rangeSize - 1, totalQuestions - 1)
    });
  }
}

function updateRangeLabel() {
  const r = state.ranges[state.currentRangeIndex];
  document.getElementById('rangeLabel').textContent = `${r.start + 1}–${r.end + 1}`;
}

function prevRange() {
  resetProgress();
  state.currentRangeIndex = (state.currentRangeIndex - 1 + state.ranges.length) % state.ranges.length;
  const r = state.ranges[state.currentRangeIndex];
  state.currentIndex = r.start;
  updateRangeLabel();
  
  // Réactiver et réinitialiser les inputs
  const inputText = document.getElementById('answerInput');
  const inputChoice = document.getElementById('answerInput2');
  if (inputText) {
    inputText.disabled = false;
    inputText.value = '';
  }
  if (inputChoice) {
    inputChoice.disabled = false;
    inputChoice.value = '';
  }
  
  if (state.isShuffleEnabled) {
    shuffleCurrentRange();
  } else {
    restoreOriginalRange();
  }
}

function nextRange() {
  resetProgress();
  state.currentRangeIndex = (state.currentRangeIndex + 1) % state.ranges.length;
  const r = state.ranges[state.currentRangeIndex];
  state.currentIndex = r.start;
  updateRangeLabel();
  
  // Réactiver et réinitialiser les inputs
  const inputText = document.getElementById('answerInput');
  const inputChoice = document.getElementById('answerInput2');
  if (inputText) {
    inputText.disabled = false;
    inputText.value = '';
  }
  if (inputChoice) {
    inputChoice.disabled = false;
    inputChoice.value = '';
  }
  
  if (state.isShuffleEnabled) {
    shuffleCurrentRange();
  } else {
    restoreOriginalRange();
  }
}

function goToPreviousQuestion() {
  if (state.conquestEnabled) return;
  
  const r = state.ranges[state.currentRangeIndex];
  if (state.currentIndex <= r.start) return;
  
  // Décrémenter les compteurs selon la réponse précédente
  const prevQuestion = state.currentDeck[state.currentIndex - 1];
  if (prevQuestion.userAnswer === 'skipped') {
    state.skippedCount = Math.max(0, state.skippedCount - 1);
  } else if (prevQuestion.userAnswer === 'correct') {
    state.correctCount = Math.max(0, state.correctCount - 1);
  }
  
  // Remettre le statut à undefined
  prevQuestion.userAnswer = undefined;
  
  state.currentIndex--;
  updateProgressDisplay();
  showQuestion();
}

function updateRangeSizeFromSlider() {
  const slider = document.getElementById('rangeSizeSlider');
  const label = document.getElementById('rangeSizeLabel');
  const index = parseInt(slider.value);
  
  state.rangeSize = CONFIG.RANGE_OPTIONS[index];
  label.textContent = state.rangeSize;
  generateRanges(state.currentDeck.length);
}

// ================================
// SHUFFLE
// ================================

function shuffleCurrentRange() {
  if (state.conquestEnabled) {
    return;
  }

  const r = state.ranges[state.currentRangeIndex];
  
  // Créer des paires [question, metadata] uniquement pour cette range
  const paired = [];
  for (let i = r.start; i <= r.end; i++) {
    paired.push([state.originalDeck[i], state.originalDeckMetadata[i]]);
  }
  
  // Shuffler les paires
  for (let i = paired.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [paired[i], paired[j]] = [paired[j], paired[i]];
  }

  // Réappliquer dans le deck à partir de r.start
  for (let i = 0; i < paired.length; i++) {
    state.currentDeck[r.start + i] = paired[i][0];
    state.deckMetadata[r.start + i] = paired[i][1];
  }

  state.currentIndex = r.start;
  resetProgress();
  updateProgressDisplay();
  showQuestion();
}

function restoreOriginalRange() {
  if (state.conquestEnabled) {
    return;
  }

  const r = state.ranges[state.currentRangeIndex];
  
  // Restaurer l'ordre original depuis originalDeck
  for (let i = r.start; i <= r.end; i++) {
    state.currentDeck[i] = state.originalDeck[i];
    state.deckMetadata[i] = state.originalDeckMetadata[i];
  }

  state.currentIndex = r.start;
  resetProgress();
  updateProgressDisplay();
  showQuestion();
}

// ================================
// QUESTION DISPLAY
// ================================

function showQuestion() {
  const r = state.ranges[state.currentRangeIndex];
  
  // In Conquest mode, never show end of range
  if (!state.conquestEnabled && (state.currentIndex > r.end || state.currentIndex >= state.currentDeck.length)) {
    showEndOfRange();
    return;
  }

  // Verify question exists
  if (!state.currentDeck[state.currentIndex]) {
    console.error('Question not found at index', state.currentIndex);
    return;
  }

  document.getElementById('endOfRangeOptions').style.display = 'none';
  
  // Gérer l'affichage du bouton bushu
  const currentDeckName = state.deckMetadata[state.currentIndex]?.deckName;
  const isBushuDeck = currentDeckName === '部首';
  
  const bushsuToggle = document.getElementById('bushsuToggle');
  const bushsuToggleChoice = document.getElementById('bushsuToggleChoice');
  
  if (bushsuToggle) bushsuToggle.style.display = isBushuDeck ? 'block' : 'none';
  if (bushsuToggleChoice) bushsuToggleChoice.style.display = isBushuDeck ? 'block' : 'none';

// Gérer le commentaire
  const comment = state.currentDeck[state.currentIndex].Comment || '';
  const commentToggle = document.getElementById('commentToggle');
  const commentToggleChoice = document.getElementById('commentToggleChoice');
  const commentText = document.getElementById('commentText');
  const commentTextChoice = document.getElementById('commentTextChoice');
  
  // Toujours réinitialiser l'état caché
  if (commentText) commentText.style.display = 'none';
  if (commentTextChoice) commentTextChoice.style.display = 'none';
  
  if (comment && comment.trim() !== '') {
    // Il y a un commentaire - afficher le bouton
    if (commentToggle) {
      commentToggle.style.display = 'block';
      commentToggle.textContent = '💡 ヒント';
    }
    if (commentToggleChoice) {
      commentToggleChoice.style.display = 'block';
      commentToggleChoice.textContent = '💡 ヒント';
    }
    if (commentText) commentText.innerHTML = formatText(comment);
    if (commentTextChoice) commentTextChoice.innerHTML = formatText(comment);
  } else {
    // Pas de commentaire - cacher le bouton
    if (commentToggle) commentToggle.style.display = 'none';
    if (commentToggleChoice) commentToggleChoice.style.display = 'none';
  }


  const question = state.currentDeck[state.currentIndex].Question;
  const correctAnswer = state.currentDeck[state.currentIndex].Answers;

// Déterminer si cette question nécessite le mode QCM
  const requiresQCM = state.deckMetadata[state.currentIndex]?.requiresQCM || false;

// En mode multi-deck, alterner selon les besoins de chaque carte
  const useQCMForThisQuestion = state.selectedDeckIndices.length > 1 
    ? requiresQCM 
    : state.isChoiceMode;

// En mode combiné, synchroniser le toggle avec le type de question
if (state.selectedDeckIndices.length > 1) {
  document.getElementById('modeToggle').checked = useQCMForThisQuestion;
}

 if (useQCMForThisQuestion) {
    showMultipleChoiceQuestion(question, correctAnswer);
    document.getElementById('textMode').style.display = 'none';
    document.getElementById('choiceMode').style.display = 'block';
        // Forcer le focus sur answerInput2
    setTimeout(() => {
      document.getElementById('answerInput2').focus();
    }, 0);
  } else {
    showTextQuestion(question);
    document.getElementById('textMode').style.display = 'block';
    document.getElementById('choiceMode').style.display = 'none';
    // Forcer le focus sur answerInput
    setTimeout(() => {
      document.getElementById('answerInput').focus();
    }, 0);
  }

  // IMPORTANT: Seulement si Conquest est activé
  if (state.conquestEnabled) {
    updateConquestProgress();
  } else {
    // Vider explicitement si Conquest n'est pas actif
    const progressElText = document.getElementById('conquestProgressText');
    const progressElChoice = document.getElementById('conquestProgressChoice');
    if (progressElText) progressElText.innerHTML = '';
    if (progressElChoice) progressElChoice.innerHTML = '';
  }


// À placer à la fin de showQuestion(), juste avant la fermeture finale
// Gérer l'affichage du bouton précédent
const prevBtn = document.getElementById('prevQuestionBtn');
if (prevBtn) {
  prevBtn.style.display = (!state.conquestEnabled && state.currentIndex > r.start) ? '' : 'none';
}


}

function showTextQuestion(question) {
  document.getElementById('question').innerHTML = formatText(question);
  document.getElementById('instructions').textContent = '';
  document.getElementById('comment').textContent = '';
  document.getElementById('result').textContent = '';
  
  const input = document.querySelector('#textMode input');
  input.value = '';
  input.focus();
}

function showMultipleChoiceQuestion(question, correctAnswer) {
  state.currentChoices = generateMultipleChoices(correctAnswer, state.currentDeck);
  
  const choicesHTML = state.currentChoices
    .map((choice, i) => `${i + 1}. ${formatText(choice, true)}`)
    .join('　');
  
  document.getElementById('questionChoice').innerHTML = formatText(question);
  document.getElementById('choices').innerHTML = choicesHTML;
  
  const input = document.querySelector('#choiceMode input');
  input.value = '';
  input.focus();
}

function generateMultipleChoices(correctAnswer, deck) {
  const choices = new Set();
  choices.add(correctAnswer);

  const currentQuestionDeck = state.deckMetadata[state.currentIndex]?.deckIndex;

  const sameDeckIndices = state.deckMetadata
    .map((meta, idx) => meta.deckIndex === currentQuestionDeck ? idx : -1)
    .filter(idx => idx !== -1);

  const candidatePool = sameDeckIndices.length >= CONFIG.MC_CHOICES_COUNT 
    ? sameDeckIndices 
    : Array.from({length: deck.length}, (_, i) => i);

  let attempts = 0;
  const maxAttempts = 100;

  while (choices.size < CONFIG.MC_CHOICES_COUNT && attempts < maxAttempts) {
    const randomPoolIndex = Math.floor(Math.random() * candidatePool.length);
    const randomIndex = candidatePool[randomPoolIndex];
    const candidate = deck[randomIndex]?.Answers;
    
    if (candidate && candidate !== correctAnswer && !choices.has(candidate)) {
      choices.add(candidate);
    }
    attempts++;
  }

  while (choices.size < CONFIG.MC_CHOICES_COUNT) {
    const randomIndex = Math.floor(Math.random() * deck.length);
    const candidate = deck[randomIndex]?.Answers;
    if (candidate && candidate !== correctAnswer && !choices.has(candidate)) {
      choices.add(candidate);
    }
  }

  return Array.from(choices).sort(() => Math.random() - 0.5);
}

function showEndOfRange() {
  document.getElementById('question').innerHTML = "🎉 全クリア!";
  document.getElementById('questionChoice').innerHTML = "🎉 全クリア!";
  document.getElementById('choices').innerHTML = '';  // Vider les choices
  document.getElementById('endOfRangeOptions').style.display = 'block';
  
  // Désactiver et réinitialiser les inputs
  const inputText = document.getElementById('answerInput');
  const inputChoice = document.getElementById('answerInput2');
  if (inputText) {
    inputText.disabled = true;
    inputText.value = '';
  }
  if (inputChoice) {
    inputChoice.disabled = true;
    inputChoice.value = '';
  }
}

function formatText(text, isChoice = false) {
  let formatted = text
    .replace(/__([^_]+)__/g, '<u>$1</u>')
    .replace(/:([^_]+):/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    //.replace(/\|\|([^|]+)\|\|/g, '<span class="spoiler">$1</span>');

  if (isChoice) {
    formatted = formatted.replace(/,/g, '、');
  }

  return formatted;
}

// ================================
// ANSWER VALIDATION
// ================================

function normalizeAnswer(answer) {
  try {
    return wanakana.toHiragana(answer.trim().toLowerCase());
  } catch (error) {
    console.warn('Wanakana conversion failed:', error);
    return answer.trim().toLowerCase();
  }
}

function checkAnswer(userInput) {
  const rawAnswers = state.currentDeck[state.currentIndex].Answers || '';
  const possibleAnswers = rawAnswers
    .replace(/"/g, '')
    .split(',')
    .map(ans => normalizeAnswer(ans));
  
  const userAnswer = normalizeAnswer(userInput);
  return possibleAnswers.includes(userAnswer);
}


async function handleTextAnswer(input) {
  const r = state.ranges[state.currentRangeIndex];
  
  // Vérification de fin de range (sauf mode Conquest)
  if (!state.conquestEnabled && (state.currentIndex > r.end || state.currentIndex >= state.currentDeck.length)) {
    return;
  }

  const inputValue = input.value.trim();

  // Conquest mode logic...
  if (state.conquestEnabled) {
     if (inputValue === '') {
      processConquestAnswer(false);
    } else {
      const isCorrect = checkAnswer(inputValue);
      processConquestAnswer(isCorrect);
    }
    showConquestQuestion();
    updateProgressDisplay();
    updateConquestProgress();
    return;
  }

  // Normal Classic Mode logic
  
  // Cas : Entrée vide = Correct
  if (inputValue === '') {
    state.currentDeck[state.currentIndex].userAnswer = 'correct';
    state.correctCount++;
    showAnswerFeedbackText('✅');
    state.currentIndex++;
    showQuestion();
    updateProgressDisplay();
    return;
  }

  // Cas : 'x' = Skip
  if (inputValue.toLowerCase() === 'x') {
    state.currentDeck[state.currentIndex].userAnswer = 'skipped';
    state.skippedCount++;
    showAnswerFeedbackText('▶️');
    input.value = '';
    state.currentIndex++;
    showQuestion();
    updateProgressDisplay();
    return;
  }

  // Cas : Vérification réponse normale
  const isCorrect = checkAnswer(inputValue);
  if (isCorrect) {
    state.currentDeck[state.currentIndex].userAnswer = 'correct';
    state.correctCount++;
    showAnswerFeedbackText('✅');
    state.currentIndex++;
    showQuestion();
    updateProgressDisplay();
  } else {
    showAnswerFeedbackText('❌');
    input.value = '';
  }
}

async function handleChoiceAnswer(input) {
  const r = state.ranges[state.currentRangeIndex];

  // Vérification fin de range (Sauf Conquest)
  if (!state.conquestEnabled && (state.currentIndex > r.end || state.currentIndex >= state.currentDeck.length)) {
    return;
  }

  const inputValue = input.value.trim();



  // Conquest mode
  if (state.conquestEnabled) {
    if (inputValue === '') {
      processConquestAnswer(false);
    } else {
      const choiceIndex = parseInt(inputValue, 10) - 1;
      
      if (isNaN(choiceIndex) || !state.currentChoices[choiceIndex]) {
        input.value = '';
        return;
      }

      const selectedAnswer = normalizeAnswer(state.currentChoices[choiceIndex]);
      const correctAnswers = (state.currentDeck[state.currentIndex].Answers || '')
        .replace(/"/g, '')
        .split(',')
        .map(ans => normalizeAnswer(ans));
      
      const isCorrect = correctAnswers.includes(selectedAnswer);
      processConquestAnswer(isCorrect);
    }
    showConquestQuestion();
    updateProgressDisplay();
    updateConquestProgress();
    return;
  }

// Normal mode - Blank = Correct
if (inputValue === '') {
  state.currentDeck[state.currentIndex].userAnswer = 'correct';
  state.correctCount++;
  showAnswerFeedbackChoice('✅');
  state.currentIndex++;
  showQuestion();
  updateProgressDisplay();
  return;
}

// Normal mode - 'x' = Skip
if (inputValue.toLowerCase() === 'x') {
  state.currentDeck[state.currentIndex].userAnswer = 'skipped';
  state.skippedCount++;
  showAnswerFeedbackChoice('▶️');
  input.value = '';
  state.currentIndex++;
  showQuestion();
  updateProgressDisplay();
  return;
}

  // Normal mode - Answer
  const choiceIndex = parseInt(inputValue, 10) - 1;
  
  if (isNaN(choiceIndex) || !state.currentChoices[choiceIndex]) {
    input.value = '';
    return;
  }

  const selectedAnswer = normalizeAnswer(state.currentChoices[choiceIndex]);
  const correctAnswers = (state.currentDeck[state.currentIndex].Answers || '')
    .replace(/"/g, '')
    .split(',')
    .map(ans => normalizeAnswer(ans));
  
  const isCorrect = correctAnswers.includes(selectedAnswer);

  if (isCorrect) {
    state.currentDeck[state.currentIndex].userAnswer = 'correct';
    state.correctCount++;
    showAnswerFeedbackChoice('✅');
    state.currentIndex++;
    showQuestion();
    updateProgressDisplay();
  } else {
    showAnswerFeedbackChoice('❌');
    input.value = '';
  }
}

function showAnswerFeedbackText(symbol) {
  // Afficher dans les DEUX spans pour être sûr
  const feedbackText = document.getElementById('answerFeedback');
  const feedbackChoice = document.getElementById('answerFeedbackChoice');
  
  if (feedbackText) {
    feedbackText.textContent = symbol;
    setTimeout(() => {
      feedbackText.textContent = '';
    }, 250);
  }
  if (feedbackChoice) {
    feedbackChoice.textContent = symbol;
    setTimeout(() => {
      feedbackChoice.textContent = '';
    }, 250);
  }
}

function showAnswerFeedbackChoice(symbol) {
  // Afficher dans les DEUX spans pour être sûr
  const feedbackText = document.getElementById('answerFeedback');
  const feedbackChoice = document.getElementById('answerFeedbackChoice');
  
  if (feedbackText) {
    feedbackText.textContent = symbol;
    setTimeout(() => {
      feedbackText.textContent = '';
    }, 250);
  }
  if (feedbackChoice) {
    feedbackChoice.textContent = symbol;
    setTimeout(() => {
      feedbackChoice.textContent = '';
    }, 250);
  }
}

// ================================
// PROGRESS & STATISTICS
// ================================

function resetProgress() {
  if (conquestCountdownInterval) {
    clearInterval(conquestCountdownInterval);
    conquestCountdownInterval = null;
  }

  state.correctCount = 0;
  state.skippedCount = 0;
}

function updateProgressDisplay() {
  const r = state.ranges[state.currentRangeIndex];
  const totalInRange = r.end - r.start + 1;
  const answered = Math.min(state.currentIndex - r.start, totalInRange);
  const percent = Math.floor((answered / totalInRange) * 100);

  document.getElementById('progressDisplay').textContent =
    `${state.correctCount} / ${totalInRange} (${percent}%) | ${state.skippedCount} skipped`;
}

function restartCurrentRange() {
  const r = state.ranges[state.currentRangeIndex];
  state.currentIndex = r.start;
  resetProgress();
  document.getElementById('endOfRangeOptions').style.display = 'none';
  updateProgressDisplay();
  
  // Réactiver les inputs
  const inputText = document.getElementById('answerInput');
  const inputChoice = document.getElementById('answerInput2');
  if (inputText) inputText.disabled = false;
  if (inputChoice) inputChoice.disabled = false;
  
  showQuestion();
}

function reviewSkipped() {
  const r = state.ranges[state.currentRangeIndex];
  const skippedIndices = [];

  for (let i = r.start; i <= r.end; i++) {
    const answer = state.currentDeck[i].userAnswer;
    if (!answer || answer === 'skipped') {
      skippedIndices.push(i);
    }
  }

  if (skippedIndices.length === 0) {
    alert("No skipped questions to review!");
    return;
  }

  state.currentDeck = skippedIndices.map(i => state.currentDeck[i]);
  state.deckMetadata = skippedIndices.map(i => state.deckMetadata[i]);
  generateRanges(state.currentDeck.length);
  state.currentRangeIndex = 0;
  state.currentIndex = 0;
  resetProgress();
  document.getElementById('endOfRangeOptions').style.display = 'none';
  updateRangeLabel();
  updateProgressDisplay();
  
  // Réactiver les inputs
  const inputText = document.getElementById('answerInput');
  const inputChoice = document.getElementById('answerInput2');
  if (inputText) inputText.disabled = false;
  if (inputChoice) inputChoice.disabled = false;
  
  showQuestion();
}

function exportSkippedToCSV() {
  const r = state.ranges[state.currentRangeIndex];
  const skippedQuestions = [];

  for (let i = r.start; i <= r.end; i++) {
    const answer = state.currentDeck[i].userAnswer;
    if (!answer || answer === 'skipped') {
      skippedQuestions.push(state.currentDeck[i]);
    }
  }

  if (skippedQuestions.length === 0) {
    alert("No skipped questions to export!");
    return;
  }

  // Créer le nom basé sur le(s) deck(s) actif(s)
let deckName;
if (state.selectedDeckIndices.length === 1) {
  deckName = state.decks[state.selectedDeckIndices[0]].name;
} else {
  deckName = '統合';
}

  // Créer le CSV
  const headers = Object.keys(skippedQuestions[0]);
  const csvContent = [
    headers.join(','),
    ...skippedQuestions.map(q => 
      headers.map(h => {
        const value = q[h] || '';
        // Échapper les guillemets et virgules
        return `"${String(value).replace(/"/g, '""')}"`;
      }).join(',')
    )
  ].join('\n');

  // Télécharger
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${deckName}_missed.csv`;
  a.click();
  URL.revokeObjectURL(url);

  //keep alert(`✅ ${skippedQuestions.length} skipped cards exported!`);
}

function addSkippedToDeck() {
  const r = state.ranges[state.currentRangeIndex];
  const skippedQuestions = [];

  for (let i = r.start; i <= r.end; i++) {
    const answer = state.currentDeck[i].userAnswer;
    if (!answer || answer === 'skipped') {
      skippedQuestions.push(state.currentDeck[i]);
    }
  }

  if (skippedQuestions.length === 0) {
    alert("No skipped questions to add!");
    return;
  }

  // Créer la liste des decks disponibles (seulement les custom decks ou créer un nouveau)
  const customDecks = state.decks
    .map((deck, index) => ({ deck, index }))
    .filter(item => item.deck.customData); // Seulement les decks custom

  let deckOptions = customDecks
    .map((item, i) => `${i + 1}. ${item.deck.name}`)
    .join('\n');
  
  deckOptions += `\n${customDecks.length + 1}. ➕ Create new deck`;

  const choice = prompt(
    `${skippedQuestions.length} skipped cards.\nSelect target deck:\n\n${deckOptions}\n\nEnter number:`
  );

  if (!choice) return;

  const choiceNum = parseInt(choice);
  
  if (isNaN(choiceNum) || choiceNum < 1 || choiceNum > customDecks.length + 1) {
    alert("❌ Invalid choice!");
    return;
  }

  let targetDeckIndex;
  let targetDeckName;

  // Option: créer un nouveau deck
  if (choiceNum === customDecks.length + 1) {
    const newDeckName = prompt("New deck name:");
    if (!newDeckName) return;

    // Vérifier si le deck existe déjà
    const existingIndex = state.decks.findIndex(d => d.name === newDeckName);
    if (existingIndex !== -1) {
      alert(`⚠️ Deck "${newDeckName}" already exists. Adding to existing deck.`);
      targetDeckIndex = existingIndex;
      targetDeckName = newDeckName;
    } else {
      // Créer un nouveau deck
      targetDeckIndex = state.decks.length;
      targetDeckName = newDeckName;
      state.decks.push({
        name: targetDeckName,
        path: null,
        requiresQCM: false,
        customData: []
      });
    }
  } else {
    // Deck existant sélectionné
    const selectedDeck = customDecks[choiceNum - 1];
    targetDeckIndex = selectedDeck.index;
    targetDeckName = selectedDeck.deck.name;
  }

  // Ajouter les questions skippées au deck cible
  const targetDeck = state.decks[targetDeckIndex];
  
  if (!targetDeck.customData) {
    targetDeck.customData = [];
  }

  // Vérifier les doublons (basé sur Question)
  let addedCount = 0;
  let duplicateCount = 0;

  skippedQuestions.forEach(q => {
    const isDuplicate = targetDeck.customData.some(
      existing => existing.Question === q.Question
    );
    
    if (!isDuplicate) {
      targetDeck.customData.push({...q});
      addedCount++;
    } else {
      duplicateCount++;
    }
  });

  // Recharger l'interface
  initDeckSelector();
  syncDeckCheckboxes();

  let message = `✅ ${addedCount} cards added to "${targetDeckName}"!`;
  if (duplicateCount > 0) {
    message += `\n⚠️ ${duplicateCount} duplicate(s) skipped.`;
  }
  alert(message);
}

// ================================
// CONQUEST MODE
// ================================

function startConquestMode() {
  toggleConquestLock(true);
  
  // Désactiver les inputs pendant le countdown
  const inputText = document.getElementById('answerInput');
  const inputChoice = document.getElementById('answerInput2');
  inputText.disabled = true;
  inputChoice.disabled = true;

  // Vider les choices affichés pendant le countdown
  document.getElementById('choices').innerHTML = '';

  // Snapshot shuffle state
  state.conquestShuffleSnapshot = state.isShuffleEnabled;

  let countdown = 3;
  document.getElementById('question').innerHTML = `⏳ Conquest mode in ${countdown}...`;
  document.getElementById('questionChoice').innerHTML = `⏳ Conquest mode in ${countdown}...`;
  conquestCountdownInterval = setInterval(() => {
    countdown--;

    if (countdown > 0) {
      document.getElementById('question').innerHTML = `⏳ Conquest mode in ${countdown}...`;
    document.getElementById('questionChoice').innerHTML = `⏳ Conquest mode in ${countdown}...`;
    } else {
      clearInterval(conquestCountdownInterval);
      conquestCountdownInterval = null;
      // Réactiver les inputs une fois le countdown terminé
      inputText.disabled = false;
      inputChoice.disabled = false;
      initializeConquestQueue();
      

      if (state.conquestQueue.length === 0) {
        document.getElementById('question').innerHTML = '🏆 ボス戦クリア!';
        document.getElementById('questionChoice').innerHTML = '🏆 ボス戦クリア!';
        toggleConquestLock(false);
        return;
      }
      
      showConquestQuestion();
    }
  }, 1000);
}

function initializeConquestQueue() {
  const r = state.ranges[state.currentRangeIndex];
  state.conquestQueue = [];
  state.conquestStats = {};

  for (let i = r.start; i <= r.end; i++) {
    state.conquestQueue.push(i);
    state.conquestStats[i] = {
      progressPercent: 0,
      consecutiveWrong: 0,
      lastWrongStreak: 0,
      postWrongSuccess: 0,
      attempts: 0,
      correct: 0,
      total: 0
    };
  }

  // Shuffle queue if shuffle was enabled
  if (state.conquestShuffleSnapshot) {
    for (let i = state.conquestQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [state.conquestQueue[i], state.conquestQueue[j]] = [state.conquestQueue[j], state.conquestQueue[i]];
    }
  }

  state.currentIndex = state.conquestQueue[0];
}

function showConquestQuestion() {
  if (state.conquestQueue.length === 0) {
    document.getElementById('question').innerHTML = '🏆 ボス戦クリア!';
    document.getElementById('questionChoice').innerHTML = '🏆 ボス戦クリア!';
    
    // Désactiver et réinitialiser les inputs
    const inputText = document.getElementById('answerInput');
    const inputChoice = document.getElementById('answerInput2');
    if (inputText) {
      inputText.disabled = true;
      inputText.value = '';
    }
    if (inputChoice) {
      inputChoice.disabled = true;
      inputChoice.value = '';
    }
    
    state.conquestEnabled = false;
    document.getElementById('conquestToggle').checked = false;
    toggleConquestLock(false);
    return;
  }

  state.currentIndex = state.conquestQueue[0];
  showQuestion();
  updateConquestProgress();
}

function ensureConquestStats(index) {
  if (!state.conquestStats[index]) {
    state.conquestStats[index] = {
      progressPercent: 0,
      consecutiveWrong: 0,
      lastWrongStreak: 0,
      postWrongSuccess: 0,
      attempts: 0,
      correct: 0,
      total: 0
    };
  }
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function processConquestAnswer(isCorrect) {
  const idx = state.currentIndex;
  ensureConquestStats(idx);
  const stats = state.conquestStats[idx];

// Déterminer quel feedback utiliser
  const requiresQCM = state.deckMetadata[idx]?.requiresQCM || false;
  const useQCMFeedback = state.selectedDeckIndices.length > 1 ? requiresQCM : state.isChoiceMode;
  
  const feedbackFunc = useQCMFeedback ? showAnswerFeedbackChoice : showAnswerFeedbackText;

  stats.total++;
  const isFirstAttempt = stats.attempts === 0;
  stats.attempts++;

  if (isCorrect) {
    stats.correct++;

    if (isFirstAttempt) {
      state.conquestQueue.shift();
      feedbackFunc('🎯');
      return;
    }

    if (stats.lastWrongStreak > 0) {
      stats.postWrongSuccess++;
      const k = stats.lastWrongStreak;
      const j = stats.postWrongSuccess;
      const step = 50 / k;
      stats.progressPercent = round2(Math.min(100, 50 + (j - 1) * step));

      stats.consecutiveWrong = 0;

      const finishedSequence = j >= (k + 1);
      if (stats.progressPercent >= state.conquestThreshold || finishedSequence) {
        state.conquestQueue.shift();
        feedbackFunc('🎯');
        return;
      }

      const cardIndex = state.conquestQueue.shift();
      const insertPosition = Math.min(
        state.conquestSpacingModifier,
        state.conquestQueue.length
      );
      state.conquestQueue.splice(insertPosition, 0, cardIndex);
      feedbackFunc('✅');
      return;
    } else {
      stats.progressPercent = 100;
      state.conquestQueue.shift();
      feedbackFunc('🎯');
      return;
    }
  } else {
    stats.consecutiveWrong++;
    stats.lastWrongStreak = stats.consecutiveWrong;
    stats.postWrongSuccess = 0;
    stats.progressPercent = 0;

    const cardIndex = state.conquestQueue.shift();
    const insertPosition = Math.min(
      state.conquestSpacingModifier,
      state.conquestQueue.length
    );
    state.conquestQueue.splice(insertPosition, 0, cardIndex);
    feedbackFunc('❌');
  }
}

function updateConquestProgress() {
  const progressElText = document.getElementById('conquestProgressText');
  const progressElChoice = document.getElementById('conquestProgressChoice');

  if (!state.conquestEnabled) {
    if (progressElText) progressElText.innerHTML = '';
    if (progressElChoice) progressElChoice.innerHTML = '';
    return;
  }

  const idx = state.currentIndex;

  // Déterminer quel élément utiliser selon le type de question actuelle
  const requiresQCM = state.deckMetadata[idx]?.requiresQCM || false;
  const useQCM = state.selectedDeckIndices.length > 1 ? requiresQCM : state.isChoiceMode;
  const progressEl = useQCM ? progressElChoice : progressElText;

  ensureConquestStats(idx);
  const stats = state.conquestStats[idx];

  const totalCards = Object.keys(state.conquestStats).length;
  const masteredCards = totalCards - state.conquestQueue.length;
  const overallPercent = Math.floor((masteredCards / totalCards) * 100);
  const remaining = state.conquestQueue.length;

  if (!stats || stats.attempts === 0) {
    progressEl.innerHTML = `
<div style="color: ${overallPercent >= 75 ? 'green' : 'orange'};">
  📊 全体: ${masteredCards}/${totalCards} (${overallPercent}%) | 残り ${remaining}
</div>
<!--<div style="color: gray;">
  🆕 このカード: 100%（未挑戦 - 最初の正解で終了）
</div>-->
    `;
    return;
  }

  const k = stats.lastWrongStreak;
  const j = stats.postWrongSuccess;
  const stepsLeft = k > 0 ? Math.max(0, (k + 1) - j) : 0;
  const cardPercent = Math.floor(stats.progressPercent);
  const full = Math.floor((cardPercent / state.conquestThreshold) * 100);

  progressEl.innerHTML = `
<div style="color: ${overallPercent >= 75 ? 'green' : 'orange'};">
  📊 全体: ${masteredCards}/${totalCards} (${overallPercent}%) | 残り ${remaining}
</div>
<div style="color: ${cardPercent >= state.conquestThreshold ? 'green' : 'red'};">
  🎯 このカード: (${stats.correct}/${stats.total}) ${cardPercent}/${state.conquestThreshold}% (${full}%)
  <!--${k > 0 ? `<div style="color: gray;">直前の誤答連続: ${k} | 成功数: ${j} | 残り復習回数: ${stepsLeft}</div>` : ''}
</div>-->
  `;
}

function updateConquestThreshold(value) {
  state.conquestThreshold = parseInt(value);
  document.getElementById('thresholdValue').textContent = `${state.conquestThreshold}%`;
}

function updateConquestSpacing(value) {
  state.conquestSpacingModifier = parseInt(value);
  document.getElementById('spacingValue').textContent = `${state.conquestSpacingModifier}x`;
}

function toggleConquestLock(lock) {
  const elements = [
    document.getElementById('prevDeckBtn'),
    document.getElementById('nextDeckBtn'),
    document.getElementById('shuffleToggle')?.closest('.toggle'),
    document.getElementById('modeToggle')?.closest('.toggle'),
    document.getElementById('rangeSizeSelector'),
    document.getElementById('prevRangeBtn'),
    document.getElementById('nextRangeBtn'),
    document.getElementById('endOfRangeOptions'),
    document.getElementById('applyDeckBtn'),
    document.getElementById('resetDeckBtn'),
    document.getElementById('conquestSettings'),
    document.getElementById('loadConquestBtn'),
    document.getElementById('importCustomDeckBtn')
    
  ];

  elements.forEach(el => {
    if (el) {
      el.style.display = lock ? 'none' : '';
      if (el.tagName === 'BUTTON') {
        el.disabled = lock;
      }
    }
  });

  const progressDisplay = document.getElementById('progressDisplay');
  if (progressDisplay) {
    progressDisplay.style.display = lock ? 'none' : '';
  }

    // Afficher le bouton de sauvegarde uniquement en mode Conquest
  const saveBtn = document.getElementById('saveConquestBtn');
  if (saveBtn) {
    saveBtn.style.display = lock ? '' : 'none';
  }
}

// ================================
// CONQUEST SAVE/LOAD
// ================================

function saveConquestPrompt() {
  const name = prompt('Session name:');
  if (!name) return;

  state.conquestSessionData = {
    name: name,
    timestamp: new Date().toISOString(),
    queue: [...state.conquestQueue],
    stats: JSON.parse(JSON.stringify(state.conquestStats)),
    threshold: state.conquestThreshold,
    spacing: state.conquestSpacingModifier,
    deckIndices: [...state.selectedDeckIndices],
    rangeIndex: state.currentRangeIndex,
    shuffleSnapshot: state.conquestShuffleSnapshot
  };

  const dataStr = JSON.stringify(state.conquestSessionData, null, 2);
  const blob = new Blob([dataStr], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `conquest_${name}_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);

  alert(`✅ Session "${name}" exported!`);

// Décocher et désactiver Conquest
  state.conquestEnabled = false;
  document.getElementById('conquestToggle').checked = false;
  
  // Nettoyer l'état
  state.conquestQueue = [];
  state.conquestStats = {};
  
  // Nettoyer l'affichage
  const progressElText = document.getElementById('conquestProgressText');
  const progressElChoice = document.getElementById('conquestProgressChoice');
  if (progressElText) progressElText.innerHTML = '';
  if (progressElChoice) progressElChoice.innerHTML = '';
  
  toggleConquestLock(false);
  showQuestion();
}

function loadConquestPrompt() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result);
        
        state.conquestQueue = data.queue;
        state.conquestStats = data.stats;
        state.conquestThreshold = data.threshold;
        state.conquestSpacingModifier = data.spacing;
        state.conquestSessionData = data;
        state.conquestShuffleSnapshot = data.shuffleSnapshot || false;

        if (data.deckIndices) {
          state.selectedDeckIndices = data.deckIndices;
          
          document.querySelectorAll('.deck-checkbox').forEach((cb, i) => {
            cb.checked = data.deckIndices.includes(i);
          });

          syncDeckCheckboxes() //add ??

          await loadCombinedDecks();
          
          if (data.rangeIndex !== undefined) {
            state.currentRangeIndex = data.rangeIndex;
            updateRangeLabel();
          }
          
          state.conquestEnabled = true;
          document.getElementById('conquestToggle').checked = true;
          toggleConquestLock(true);
          showConquestQuestion();
          alert(`✅ Session "${data.name}" loaded!`);
        }
      } catch (err) {
        alert('❌ Invalid file!');
        console.error(err);
      }
    };
    reader.readAsText(file);
  };
  
  input.click();
}

function importCustomDeck() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv';
  input.multiple = true; // Permet de sélectionner plusieurs fichiers
  
  input.onchange = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    try {
      const newDeckIndices = [];

      for (const file of files) {
        const text = await file.text();
        
        await new Promise((resolve, reject) => {
          Papa.parse(text, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
              if (!results.data || results.data.length === 0) {
                reject(new Error(`Empty file: ${file.name}`));
                return;
              }

              // Vérifier que les colonnes nécessaires existent
              const firstRow = results.data[0];
              if (!firstRow.Question || !firstRow.Answers) {
                reject(new Error(`Invalid format in ${file.name}. Need "Question" and "Answers" columns.`));
                return;
              }

              // Vérifier si ce deck existe déjà (par nom)
              const deckName = file.name.replace('.csv', '');
              const existingDeckIndex = state.decks.findIndex(d => d.name === deckName);

              if (existingDeckIndex !== -1) {
                // Le deck existe déjà, on skip
                console.log(`Deck "${deckName}" already exists, skipping...`);
                // Ne pas l'ajouter à newDeckIndices
              } else {
                // Nouveau deck, on l'ajoute
                const deckIndex = state.decks.length;
                state.decks.push({
                  name: deckName,
                  path: null,
                  requiresQCM: false,
                  customData: results.data
                });
                newDeckIndices.push(deckIndex);
              }
              resolve();
            },
            error: (error) => {
              reject(error);
            }
          });
        });
      }

      const skippedCount = files.length - newDeckIndices.length;

      // Si tous les decks étaient des doublons, ne pas recharger
      if (newDeckIndices.length === 0) {
        alert(`⚠️ All ${files.length} deck(s) already existed. No changes made.`);
        return;
      }

      // Remplacer la sélection actuelle par les nouveaux decks importés
      state.selectedDeckIndices = newDeckIndices;

      // Recharger l'interface du sélecteur
      initDeckSelector();
      syncDeckCheckboxes();

      // Charger les decks
      await loadCombinedDecks();

      let message = `✅ ${newDeckIndices.length} custom deck(s) imported!`;
      if (skippedCount > 0) {
        message += `\n⚠️ ${skippedCount} deck(s) already existed and were skipped.`;
      }
      //keep - alert(message);

    } catch (error) {
      alert(`❌ Import failed: ${error.message}`);
      console.error(error);
    }
  };
  
  input.click();
}

// ================================
// EVENT LISTENERS
// ================================

function initEventListeners() {
  const rangeSizeSlider = document.getElementById('rangeSizeSlider');
  if (rangeSizeSlider) {
    rangeSizeSlider.addEventListener('input', updateRangeSizeFromSlider);
  }

  // --- GESTION DES INPUTS (CORRIGÉ POUR LE SKIP 'X') ---
  const input1 = document.getElementById('answerInput');
  if (input1) {
      input1.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          handleTextAnswer(e.target);
        } 
        // Si on appuie sur 'x' et que le champ est vide
        else if (e.key.toLowerCase() === 'x' && e.target.value === '') {
          if (!state.conquestEnabled) {
            e.preventDefault(); // Empêche d'écrire le x deux fois
            e.target.value = 'x'; // ON FORCE LA VALEUR À 'x'
            handleTextAnswer(e.target);
          }
        }
      });
  }

  const input2 = document.getElementById('answerInput2');
  if (input2) {
      input2.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          handleChoiceAnswer(e.target);
        } 
        // Si on appuie sur 'x' et que le champ est vide
        else if (e.key.toLowerCase() === 'x' && e.target.value === '') {
          if (!state.conquestEnabled) {
            e.preventDefault();
            e.target.value = 'x'; // ON FORCE LA VALEUR À 'x'
            handleChoiceAnswer(e.target);
          }
        }
      });
      
      // Validation chiffres 1-4
      input2.addEventListener('input', (e) => {
        // On autorise le 'x' maintenant, sinon il serait effacé par cette validation
        if (e.target.value.toLowerCase() === 'x') return; 

        const value = parseInt(e.target.value);
        if (isNaN(value)) {
            e.target.value = ''; // Efface si ce n'est pas un nombre
        } else if (value < 1 || value > 4) {
            e.target.value = '';
        }
      });
  }

  // --- TOGGLES ---
  document.getElementById('modeToggle')?.addEventListener('click', () => {
    state.isChoiceMode = !state.isChoiceMode;
    document.getElementById('textMode').style.display = state.isChoiceMode ? 'none' : 'block';
    document.getElementById('choiceMode').style.display = state.isChoiceMode ? 'block' : 'none';
    showQuestion();
  });

  document.getElementById('shuffleToggle')?.addEventListener('change', (e) => {
    if (state.conquestEnabled) {
      e.target.checked = !e.target.checked;
      alert('⚠️ Cannot change shuffle during Conquest mode');
      return;
    }
    state.isShuffleEnabled = e.target.checked;
    if (state.isShuffleEnabled) shuffleCurrentRange();
    else restoreOriginalRange();
  });

  // --- CONQUEST ---
  document.getElementById('conquestToggle')?.addEventListener('change', (e) => {
    state.conquestEnabled = e.target.checked;
    if (state.conquestEnabled) {
      startConquestMode();
    } else {
      if (conquestCountdownInterval) {
        clearInterval(conquestCountdownInterval);
        conquestCountdownInterval = null;
        document.getElementById('answerInput').disabled = false;
        document.getElementById('answerInput2').disabled = false;
      }
      const p1 = document.getElementById('conquestProgressText');
      const p2 = document.getElementById('conquestProgressChoice');
      if (p1) p1.innerHTML = '';
      if (p2) p2.innerHTML = '';
      toggleConquestLock(false);
      showQuestion();
    }
  });

  document.getElementById('conquestThresholdInput')?.addEventListener('input', (e) => {
    updateConquestThreshold(e.target.value);
  });

  document.getElementById('conquestSpacingInput')?.addEventListener('input', (e) => {
    updateConquestSpacing(e.target.value);
  });
}

function initButtonListeners() {
  document.getElementById('applyDeckBtn')?.addEventListener('click', applyDeckSelection);
  document.getElementById('resetDeckBtn')?.addEventListener('click', resetDeckSelection);
  
  document.getElementById('prevDeckBtn')?.addEventListener('click', prevDeck);
  document.getElementById('nextDeckBtn')?.addEventListener('click', nextDeck);
  
  document.getElementById('prevRangeBtn')?.addEventListener('click', prevRange);
  document.getElementById('nextRangeBtn')?.addEventListener('click', nextRange);
  
  document.getElementById('restartRangeBtn')?.addEventListener('click', restartCurrentRange);
  document.getElementById('reviewSkippedBtn')?.addEventListener('click', reviewSkipped);
  
  document.getElementById('saveConquestBtn')?.addEventListener('click', saveConquestPrompt);
  document.getElementById('loadConquestBtn')?.addEventListener('click', loadConquestPrompt);

  document.getElementById('prevQuestionBtn')?.addEventListener('click', goToPreviousQuestion);
  document.getElementById('addSkippedToDeckBtn')?.addEventListener('click', addSkippedToDeck);
  
  document.getElementById('importCustomDeckBtn')?.addEventListener('click', importCustomDeck);
  document.getElementById('exportSkippedBtn')?.addEventListener('click', exportSkippedToCSV);
  const selectorButton = document.getElementById("Selector");
  selectorButton.addEventListener("click", toggleDeckSelector);

// Toggle image bushu
  document.getElementById('bushsuToggle')?.addEventListener('click', (e) => {
    const img = document.getElementById('bushsuImage');
    const isVisible = img.style.display !== 'none';
    img.style.display = isVisible ? 'none' : 'block';
    e.target.textContent = isVisible ? '📖 部首表' : '📖 隠す';
  });
  
  document.getElementById('bushsuToggleChoice')?.addEventListener('click', (e) => {
    const img = document.getElementById('bushsuImageChoice');
    const isVisible = img.style.display !== 'none';
    img.style.display = isVisible ? 'none' : 'block';
    e.target.textContent = isVisible ? '📖 部首表' : '📖 隠す';
  });

// Toggle commentaire
  document.getElementById('commentToggle')?.addEventListener('click', (e) => {
    const text = document.getElementById('commentText');
    const isVisible = text.style.display === 'block';
    text.style.display = isVisible ? 'none' : 'block';
    e.target.textContent = isVisible ? '💡 ヒント' : '💡 隠す';
  });
  
  document.getElementById('commentToggleChoice')?.addEventListener('click', (e) => {
    const text = document.getElementById('commentTextChoice');
    const isVisible = text.style.display === 'block';
    text.style.display = isVisible ? 'none' : 'block';
    e.target.textContent = isVisible ? '💡 ヒント' : '💡 隠す';
  });
}

// ================================
// DECK SELECTOR TOGGLE
// ================================

function toggleDeckSelector() {
  const deckSelector = document.getElementById('deckSelector');
  const selectorButton = document.getElementById("Selector");
  
  if (deckSelector.style.display === "none") {
    deckSelector.style.display = "block";
    selectorButton.textContent = "📚 隠す";
  } else {
    deckSelector.style.display = "none";
    selectorButton.textContent = "📚 選択";
  }
}

// ================================
// START APPLICATION
// ================================

init();

document.getElementById('answerInput2').addEventListener('input', (e) => {
  const value = parseInt(e.target.value);
  if (value < 1 || value > 4) {
    e.target.value = '';
  }
});
