const cardSound = document.getElementById('cardSound');
const messageEl = document.getElementById('message');
const biddingModal = document.getElementById('biddingModal');
const bidInput = document.getElementById('bidInput');
const submitBid = document.getElementById('submitBid');
const myHandEl = document.getElementById('myHand');

const playerContainers = document.querySelectorAll('.player');
const playedCardEls = document.querySelectorAll('.played-card');

const suits = ['clubs', 'diamonds', 'hearts', 'spades'];
const ranks = ['A','K','Q','J','10','9','8','7','6','5','4','3','2'];

const unicodeMap = {
  clubs: {A:'🃑',K:'🃞',Q:'🃝',J:'🃛',10:'🃚',9:'🃙',8:'🃘',7:'🃗',6:'🃖',5:'🃕',4:'🃔',3:'🃓',2:'🃒'},
  diamonds: {A:'🃁',K:'🃎',Q:'🃍',J:'🃋',10:'🃊',9:'🃉',8:'🃈',7:'🃇',6:'🃆',5:'🃅',4:'🃄',3:'🃃',2:'🃂'},
  hearts: {A:'🂱',K:'🂾',Q:'🂽',J:'🂻',10:'🂺',9:'🂹',8:'🂸',7:'🂷',6:'🂶',5:'🂵',4:'🂴',3:'🂳',2:'🂲'},
  spades: {A:'🂡',K:'🂮',Q:'🂭',J:'🂫',10:'🂪',9:'🂩',8:'🂨',7:'🂧',6:'🂦',5:'🂥',4:'🂤',3:'🂣',2:'🂢'}
};

let roomId = null;
let roomRef = null;
let myUid = null;
let myPosition = null;
let positionToUid = {};
let uidToPosition = {};
let myHand = [];

function getUnicode(card) { return unicodeMap[card.suit][card.rank]; }
function isRed(suit) { return suit === 'hearts' || suit === 'diamonds'; }
function rankValue(rank) { return ranks.indexOf(rank) !== -1 ? 13 - ranks.indexOf(rank) : 0; }

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function createDeck() {
  let deck = [];
  for (let s of suits) for (let r of ranks) deck.push({suit: s, rank: r});
  return deck;
}

function sortHand(hand) {
  const suitOrder = {clubs:0, diamonds:1, hearts:2, spades:3};
  hand.sort((a,b) => suitOrder[a.suit] - suitOrder[b.suit] || rankValue(b.rank) - rankValue(a.rank));
  return hand;
}

document.getElementById('playButton').onclick = () => {
  const name = document.getElementById('playerName').value.trim() || 'Player';
  auth.signInAnonymously().then(cred => {
    myUid = cred.user.uid;
    findOrCreateRoom(name);
  });
};

function findOrCreateRoom(name) {
  db.ref('rooms').once('value').then(snap => {
    let openRoom = null;
    snap.forEach(child => {
      const room = child.val();
      if (room.state === 'waiting' && Object.keys(room.players || {}).length < 4) {
        openRoom = child.key;
        return true;
      }
    });
    if (openRoom) joinRoom(openRoom, name);
    else createRoom(name);
  });
}

function createRoom(name) {
  const newRoomRef = db.ref('rooms').push();
  roomId = newRoomRef.key;
  roomRef = newRoomRef;
  newRoomRef.set({
    state: 'waiting',
    players: {[myUid]: {name, position: 0}},
    playerOrder: [myUid],
    round: 1,
    scores: {0:0,1:0,2:0,3:0},
    dealerPosition: 0
  }).then(() => setupRoom());
}

function joinRoom(id, name) {
  roomId = id;
  roomRef = db.ref('rooms/' + roomId);
  roomRef.transaction(room => {
    if (room && room.state === 'waiting' && Object.keys(room.players || {}).length < 4) {
      const pos = room.playerOrder ? room.playerOrder.length : 0;
      room.players[myUid] = {name, position: pos};
      room.playerOrder.push(myUid);
      return room;
    }
  }).then(res => {
    if (res.committed) setupRoom();
    else findOrCreateRoom(name);
  });
}

function setupRoom() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('gameScreen').classList.remove('hidden');

  roomRef.child('players').child(myUid).onDisconnect().remove();

  roomRef.on('value', snap => {
    const room = snap.val();
    if (!room || !room.players[myUid]) return;
    myPosition = room.players[myUid].position;
    positionToUid = {};
    room.playerOrder.forEach((uid, pos) => positionToUid[pos] = uid);
    uidToPosition = Object.fromEntries(Object.entries(room.players).map(([uid, p]) => [uid, p.position]));

    updatePlayersUI(room);
    if (room.state === 'waiting') showMessage(`Waiting for players (${Object.keys(room.players).length}/4)`);
    if (room.state === 'dealing' && myPosition === room.dealerPosition) dealCards(room);
    if (room.state === 'bidding') handleBidding(room);
    if (room.state === 'playing') handlePlaying(room);
    if (room.state === 'roundEnd') handleRoundEnd(room);
  });
}

function updatePlayersUI(room) {
  playerContainers.forEach(container => {
    const pos = parseInt(container.dataset.pos);
    const relativePos = (pos + (4 - myPosition)) % 4;
    const playerContainer = playerContainers[relativePos];
    const uid = positionToUid[pos];
    const player = uid ? room.players[uid] : null;
    playerContainer.querySelector('.name').innerText = player ? player.name : '';
    playerContainer.querySelector('.bid').innerText = room.bids && room.bids[pos] != null ? 'Bid: ' + room.bids[pos] : 'Bid: -';
    playerContainer.querySelector('.tricks').innerText = room.tricksWon ? 'Tricks: ' + (room.tricksWon[pos] || 0) : 'Tricks: 0';
    if (pos === myPosition) playerContainer.querySelector('.score').innerText = 'Score: ' + (room.scores[pos] || 0);
  });
}

function dealCards(room) {
  if (room.hands) return; // already dealt
  let deck = shuffle(createDeck());
  const hands = {};
  room.playerOrder.forEach(uid => hands[uid] = deck.splice(0,13).map(c => ({suit: c.suit, rank: c.rank})));
  roomRef.update({
    hands,
    currentDealer: positionToUid[room.dealerPosition],
    state: 'bidding',
    bids: {0:null,1:null,2:null,3:null},
    tricksWon: {0:0,1:0,2:0,3:0},
    currentTrick: {},
    playedCount: 0,
    turnPosition: (room.dealerPosition + 1) % 4,
    currentBidder: (room.dealerPosition + 1) % 4
  });
}

function handleBidding(room) {
  updateTrickDisplay({});
  if (room.currentBidder === myPosition) {
    biddingModal.classList.remove('hidden');
    submitBid.onclick = () => {
      const bid = parseInt(bidInput.value);
      if (bid >= 1 && bid <= 13) {
        roomRef.child('bids').child(myPosition).set(bid);
        biddingModal.classList.add('hidden');
        const nextBidder = (room.currentBidder + 1) % 4;
        roomRef.child('currentBidder').set(nextBidder);
        if (nextBidder === (room.dealerPosition + 1) % 4) checkAllBids(room);
      }
    };
  }
}

function checkAllBids(room) {
  const bids = room.bids || {};
  if (Object.values(bids).every(b => b !== null)) {
    roomRef.update({state: 'playing'});
  }
}

function handlePlaying(room) {
  myHand = room.hands ? (room.hands[myUid] || []) : [];
  renderMyHand(room);
  renderOtherHands(room);
  updateTrickDisplay(room.currentTrick || {});
  if (room.turnPosition === myPosition) showMessage('Your turn');
  if (room.playedCount === 4) setTimeout(() => evaluateTrick(room), 1000);
}

function renderMyHand(room) {
  myHandEl.innerHTML = '';
  sortHand(myHand);
  const ledSuit = getLedSuit(room);
  const playable = ledSuit ? myHand.filter(c => c.suit === ledSuit || !myHand.some(c2 => c2.suit === ledSuit)) : myHand;
  myHand.forEach(card => {
    const el = document.createElement('div');
    el.className = 'card' + (isRed(card.suit) ? ' red' : '');
    el.innerText = getUnicode(card);
    if (playable.some(p => p.suit === card.suit && p.rank === card.rank)) el.classList.add('playable');
    el.onclick = () => playCard(card);
    myHandEl.appendChild(el);
  });
}

function renderOtherHands(room) {
  [1,2,3].forEach(rel => {
    const pos = (myPosition + rel) % 4;
    const uid = positionToUid[pos];
    const count = uid && room.hands ? (room.hands[uid] || []).length : 13;
    const container = playerContainers[rel];
    const handEl = container.querySelector('.hand');
    handEl.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.className = 'card';
      el.innerText = '🂠';
      handEl.appendChild(el);
    }
  });
}

function getLedSuit(room) {
  if (!room.currentTrick || Object.keys(room.currentTrick).length === 0) return null;
  const leaderPos = room.turnPosition === myPosition ? (myPosition + 3) % 4 : Object.keys(room.currentTrick).find(p => room.currentTrick[p]); // rough
  return leaderPos != null ? room.currentTrick[leaderPos].suit : null;
}

function playCard(card) {
  cardSound.play();
  myHand = myHand.filter(c => !(c.suit === card.suit && c.rank === card.rank));
  roomRef.child('hands').child(myUid).set(myHand);
  roomRef.child('currentTrick').child(myPosition).set(card);
  roomRef.child('playedCount').set(firebase.database.ServerValue.increment(1));
  roomRef.child('turnPosition').set((myPosition + 1) % 4);
}

function updateTrickDisplay(trick) {
  playedCardEls.forEach(el => el.innerHTML = '');
  Object.keys(trick || {}).forEach(posStr => {
    const pos = parseInt(posStr);
    const relative = (pos - myPosition + 4) % 4;
    const target = ['bottom','right','top','left'][relative];
    const el = document.querySelector(`.played-card.${target}`);
    const card = trick[pos];
    el.innerHTML = `<div class="card ${isRed(card.suit) ? 'red' : ''}">${getUnicode(card)}</div>`;
  });
}

function evaluateTrick(room) {
  const trick = room.currentTrick;
  let winnerPos = room.turnPosition; // default first player
  let bestCard = null;
  let ledSuit = null;
  let trumpPlayed = false;
  Object.keys(trick).forEach(pStr => {
    const pos = parseInt(pStr);
    const card = trick[pos];
    if (!ledSuit) ledSuit = card.suit;
    if (card.suit === 'spades') trumpPlayed = true;
    if (!bestCard || (card.suit === 'spades' && bestCard.suit !== 'spades') || (card.suit === bestCard.suit && rankValue(card.rank) > rankValue(bestCard.rank))) {
      bestCard = card;
      winnerPos = pos;
    }
  });
  roomRef.child('tricksWon').child(winnerPos).set((room.tricksWon[winnerPos] || 0) + 1);
  roomRef.update({
    currentTrick: {},
    playedCount: 0,
    turnPosition: winnerPos
  });
  const totalTricks = Object.values(room.tricksWon).reduce((a,b) => a+b, 0);
  if (totalTricks === 13) endRound(room);
}

function endRound(room) {
  const bids = room.bids;
  const tricks = room.tricksWon;
  const newScores = {};
  for (let p = 0; p < 4; p++) {
    const b = bids[p];
    const t = tricks[p] || 0;
    const scoreAdd = t >= b ? b + 0.1 * (t - b) : -b;
    newScores[p] = (room.scores[p] || 0) + scoreAdd;
  }
  const nextDealer = (room.dealerPosition + 1) % 4;
  const nextRound = room.round + 1;
  if (nextRound > 5) {
    roomRef.update({state: 'gameEnd', finalScores: newScores});
    showMessage('Game Over! Scores: ' + Object.values(newScores).map(s => s.toFixed(1)).join(' - '));
  } else {
    roomRef.update({
      state: 'dealing',
      scores: newScores,
      dealerPosition: nextDealer,
      round: nextRound,
      hands: null
    });
    showMessage(`Round ${room.round} ended. Starting round ${nextRound}`);
  }
}

function showMessage(msg) { messageEl.innerText = msg; }