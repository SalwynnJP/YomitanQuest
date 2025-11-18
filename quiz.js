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
  conquestShuffleSnapshot: false
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
  loadCombinedDecks();
// Masquer le bouton de sauvegarde au démarrage
  const saveBtn = document.getElementById('saveConquestBtn');
  if (saveBtn) {
    saveBtn.style.display = 'none';
  }
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
    "decks/all.csv", "decks/二字.csv", "decks/三字.csv", "decks/四字.csv"
  ];
  
  // Default mode QCM
  const qcmRequiredDecks = [
    '擬音', '熟字訓その2', '熟語その1', '熟語その2', 
    '四その1', '四その2', '四その3',
    '諺その1', '諺その2', '諺その3', '諺その4'];
  
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
  resetProgress();
  state.currentDeck = [];
  state.deckMetadata = [];

  const loadPromises = state.selectedDeckIndices.map(async (index) => {
    const deckUrl = chrome.runtime.getURL(state.decks[index].path);
    const response = await fetch(deckUrl);
    const csv = await response.text();
    
    return new Promise(resolve => {
      Papa.parse(csv, {
        header: true,
        skipEmptyLines: true,
        complete: results => {
          results.data.forEach(question => {
            state.currentDeck.push(question);
            state.deckMetadata.push({
              deckIndex: index,
              deckName: state.decks[index].name,
              requiresQCM: state.decks[index].requiresQCM
            });
          });
          resolve();
        }
      });
    });
  });

  await Promise.all(loadPromises);
  
  // Distribution équilibrée des cartes quand plusieurs decks sont combinés
if (state.selectedDeckIndices.length > 1) {
  interleaveDecks();
}

  state.originalDeck = state.currentDeck.map(q => ({...q}));
  state.originalDeckMetadata = [...state.deckMetadata];

  const hasQCMRequiredDeck = state.selectedDeckIndices.some(i => state.decks[i].requiresQCM);
  
  if (hasQCMRequiredDeck && state.selectedDeckIndices.length === 1) {
    state.isChoiceMode = true;
    document.getElementById('modeToggle').checked = true;
  } else if (state.selectedDeckIndices.length === 1) {
    state.isChoiceMode = false;
    document.getElementById('modeToggle').checked = false;
  }
  
  updateDeckDisplay();
  generateRanges(state.currentDeck.length);
  state.currentRangeIndex = 0;
  state.currentIndex = state.ranges[0].start;
  
  if (state.isShuffleEnabled) {
    shuffleCurrentRange();
  }
  
  updateRangeLabel();
  
  // Réactiver les inputs au chargement
  const inputText = document.getElementById('answerInput');
  const inputChoice = document.getElementById('answerInput2');
  if (inputText) inputText.disabled = false;
  if (inputChoice) inputChoice.disabled = false;
  
  showQuestion();
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

function handleTextAnswer(input) {
  const r = state.ranges[state.currentRangeIndex];
  
  if (!state.conquestEnabled && (state.currentIndex > r.end || state.currentIndex >= state.currentDeck.length)) {
    return;
  }

  const inputValue = input.value.trim();

  // Conquest mode
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

  // Normal mode - Skip
  if (inputValue === '') {
    state.currentDeck[state.currentIndex].userAnswer = 'skipped';
    state.skippedCount++;
    showAnswerFeedbackText('▶️');
    state.currentIndex++;
    showQuestion();
    updateProgressDisplay();
    return;
  }

  // Normal mode - Answer
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

function handleChoiceAnswer(input) {
  const r = state.ranges[state.currentRangeIndex];

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

  // Normal mode - Skip
  if (inputValue === '') {
    state.currentDeck[state.currentIndex].userAnswer = 'skipped';
    state.skippedCount++;
    showAnswerFeedbackChoice('▶️');
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
    document.getElementById('loadConquestBtn')
    
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

// ================================
// EVENT LISTENERS
// ================================

function initEventListeners() {
  const rangeSizeSlider = document.getElementById('rangeSizeSlider');
  if (rangeSizeSlider) {
    rangeSizeSlider.addEventListener('input', updateRangeSizeFromSlider);
  }

  document.getElementById('answerInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleTextAnswer(e.target);
    }
  });

  document.getElementById('answerInput2').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleChoiceAnswer(e.target);
    }
  });

  document.getElementById('modeToggle').addEventListener('click', () => {
    state.isChoiceMode = !state.isChoiceMode;
    document.getElementById('textMode').style.display = state.isChoiceMode ? 'none' : 'block';
    document.getElementById('choiceMode').style.display = state.isChoiceMode ? 'block' : 'none';
    showQuestion();
  });

  document.getElementById('shuffleToggle').addEventListener('change', (e) => {
    if (state.conquestEnabled) {
      e.target.checked = !e.target.checked;
      alert('⚠️ Cannot change shuffle during Conquest mode');
      return;
    }
    
    state.isShuffleEnabled = e.target.checked;
    if (state.isShuffleEnabled) {
      shuffleCurrentRange();
    } else {
      restoreOriginalRange();
    }
  });

  document.getElementById('conquestToggle').addEventListener('change', (e) => {
    state.conquestEnabled = e.target.checked;
    if (state.conquestEnabled) {
      startConquestMode();
    } else {
      if (conquestCountdownInterval) {
        clearInterval(conquestCountdownInterval);
        conquestCountdownInterval = null;

   // Réactiver les inputs si on annule pendant le countdown
      document.getElementById('answerInput').disabled = false;
      document.getElementById('answerInput2').disabled = false;
      }

    // Reset les deux éléments de progression
    const progressElText = document.getElementById('conquestProgressText');
    const progressElChoice = document.getElementById('conquestProgressChoice');
    if (progressElText) progressElText.innerHTML = '';
    if (progressElChoice) progressElChoice.innerHTML = '';

      //document.getElementById('conquestProgress').textContent = '';
      toggleConquestLock(false);
      showQuestion();
    }
  });

  document.getElementById('conquestThresholdInput').addEventListener('input', (e) => {
    updateConquestThreshold(e.target.value);
  });

  document.getElementById('conquestSpacingInput').addEventListener('input', (e) => {
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

    const selectorButton = document.getElementById("Selector");
  selectorButton.addEventListener("click", toggleDeckSelector);
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
