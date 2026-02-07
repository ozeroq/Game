const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const resetBtn = document.getElementById("resetBtn");
const flipBtn = document.getElementById("flipBtn");
const aiToggle = document.getElementById("aiToggle");
const aiColorSelect = document.getElementById("aiColor");
const aiLevelSelect = document.getElementById("aiLevel");
const promotionModal = document.getElementById("promotionModal");

const PIECES = {
  P: "♙",
  N: "♘",
  B: "♗",
  R: "♖",
  Q: "♕",
  K: "♔",
  p: "♟",
  n: "♞",
  b: "♝",
  r: "♜",
  q: "♛",
  k: "♚",
};

let board = [];
let turn = "w";
let selected = null;
let legalMoves = [];
let flipped = false;
let enPassant = null;
let castling = null;
let pendingPromotion = null;

function initBoard() {
  board = [
    ["r", "n", "b", "q", "k", "b", "n", "r"],
    ["p", "p", "p", "p", "p", "p", "p", "p"],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    ["P", "P", "P", "P", "P", "P", "P", "P"],
    ["R", "N", "B", "Q", "K", "B", "N", "R"],
  ];
  turn = "w";
  selected = null;
  legalMoves = [];
  enPassant = null;
  castling = {
    w: { k: true, q: true },
    b: { k: true, q: true },
  };
  pendingPromotion = null;
  hidePromotion();
  updateStatus();
  renderBoard();
  maybeMakeAIMove();
}

function renderBoard() {
  boardEl.innerHTML = "";
  const rows = [...Array(8).keys()];
  const cols = [...Array(8).keys()];
  const displayRows = flipped ? rows : rows.slice().reverse();
  const displayCols = flipped ? cols.slice().reverse() : cols;

  displayRows.forEach((r) => {
    displayCols.forEach((c) => {
      const square = document.createElement("div");
      const isLight = (r + c) % 2 === 0;
      square.className = `square ${isLight ? "light" : "dark"}`;
      square.dataset.r = r;
      square.dataset.c = c;

      const piece = board[r][c];
      if (piece) {
        square.textContent = PIECES[piece];
      }

      if (selected && selected.r === r && selected.c === c) {
        square.classList.add("selected");
      }

      for (const move of legalMoves) {
        if (move.r === r && move.c === c) {
          square.classList.add(move.capture ? "capture" : "move");
        }
      }

      square.addEventListener("click", () => handleSquareClick(r, c));
      boardEl.appendChild(square);
    });
  });
}

function handleSquareClick(r, c) {
  if (pendingPromotion) return;
  const piece = board[r][c];

  if (selected && selected.r === r && selected.c === c) {
    selected = null;
    legalMoves = [];
    renderBoard();
    return;
  }

  if (selected) {
    const move = legalMoves.find((m) => m.r === r && m.c === c);
    if (move) {
      if (move.promote && !move.promoteTo) {
        pendingPromotion = { from: selected, move };
        showPromotion();
        return;
      }
      makeMove(selected, move);
      selected = null;
      legalMoves = [];
      renderBoard();
      updateStatus();
      maybeMakeAIMove();
      return;
    }
  }

  if (piece && isPieceColor(piece, turn)) {
    selected = { r, c };
    legalMoves = getLegalMoves(r, c, board, turn);
  } else {
    selected = null;
    legalMoves = [];
  }

  renderBoard();
}

function makeMove(from, move) {
  const nextCtx = applyMoveWithContext(
    board,
    from,
    move,
    turn,
    { enPassant, castling }
  );
  enPassant = nextCtx.enPassant;
  castling = nextCtx.castling;
  turn = turn === "w" ? "b" : "w";
}

function getLegalMoves(r, c, state, color) {
  return getLegalMovesWithContext(r, c, state, color, {
    enPassant,
    castling,
  });
}

function getLegalMovesWithContext(r, c, state, color, ctx) {
  const piece = state[r][c];
  if (!piece) return [];
  const pseudo = getPseudoMoves(r, c, state, ctx);
  const legal = [];
  for (const move of pseudo) {
    const next = cloneBoard(state);
    const nextCtx = applyMoveWithContext(next, { r, c }, move, color, ctx);
    if (move.castle) {
      if (isInCheck(state, color)) continue;
      const row = color === "w" ? 7 : 0;
      const passCol = move.castle === "k" ? 5 : 3;
      const endCol = move.castle === "k" ? 6 : 2;
      if (
        isSquareAttacked(state, row, passCol, color === "w" ? "b" : "w") ||
        isSquareAttacked(state, row, endCol, color === "w" ? "b" : "w")
      ) {
        continue;
      }
    }
    if (!isInCheck(next, color)) {
      legal.push(move);
    }
  }
  return legal;
}

function getPseudoMoves(r, c, state, ctx) {
  const piece = state[r][c];
  if (!piece) return [];
  const color = isUpper(piece) ? "w" : "b";
  const moves = [];

  switch (piece.toLowerCase()) {
    case "p":
      addPawnMoves(r, c, state, color, moves, ctx);
      break;
    case "n":
      addKnightMoves(r, c, state, color, moves);
      break;
    case "b":
      addSlidingMoves(r, c, state, color, moves, [
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
      ]);
      break;
    case "r":
      addSlidingMoves(r, c, state, color, moves, [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]);
      break;
    case "q":
      addSlidingMoves(r, c, state, color, moves, [
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]);
      break;
    case "k":
      addKingMoves(r, c, state, color, moves, ctx);
      break;
    default:
      break;
  }

  return moves;
}

function addPawnMoves(r, c, state, color, moves, ctx) {
  const dir = color === "w" ? -1 : 1;
  const startRow = color === "w" ? 6 : 1;
  const nextRow = r + dir;

  if (inBounds(nextRow, c) && !state[nextRow][c]) {
    const promote = nextRow === (color === "w" ? 0 : 7);
    moves.push({ r: nextRow, c, capture: false, promote });

    const twoRow = r + dir * 2;
    if (r === startRow && !state[twoRow][c]) {
      moves.push({ r: twoRow, c, capture: false, promote: false });
    }
  }

  for (const dc of [-1, 1]) {
    const cr = r + dir;
    const cc = c + dc;
    if (!inBounds(cr, cc)) continue;
    const target = state[cr][cc];
    if (target && !isPieceColor(target, color)) {
      const promote = cr === (color === "w" ? 0 : 7);
      moves.push({ r: cr, c: cc, capture: true, promote });
    }
  }

  if (ctx.enPassant) {
    if (r + dir === ctx.enPassant.r && Math.abs(c - ctx.enPassant.c) === 1) {
      moves.push({
        r: ctx.enPassant.r,
        c: ctx.enPassant.c,
        capture: true,
        promote: false,
        enPassant: true,
      });
    }
  }
}

function addKnightMoves(r, c, state, color, moves) {
  const deltas = [
    [-2, -1],
    [-2, 1],
    [-1, -2],
    [-1, 2],
    [1, -2],
    [1, 2],
    [2, -1],
    [2, 1],
  ];
  for (const [dr, dc] of deltas) {
    const nr = r + dr;
    const nc = c + dc;
    if (!inBounds(nr, nc)) continue;
    const target = state[nr][nc];
    if (!target || !isPieceColor(target, color)) {
      moves.push({ r: nr, c: nc, capture: !!target, promote: false });
    }
  }
}

function addSlidingMoves(r, c, state, color, moves, directions) {
  for (const [dr, dc] of directions) {
    let nr = r + dr;
    let nc = c + dc;
    while (inBounds(nr, nc)) {
      const target = state[nr][nc];
      if (!target) {
        moves.push({ r: nr, c: nc, capture: false, promote: false });
      } else {
        if (!isPieceColor(target, color)) {
          moves.push({ r: nr, c: nc, capture: true, promote: false });
        }
        break;
      }
      nr += dr;
      nc += dc;
    }
  }
}

function addKingMoves(r, c, state, color, moves, ctx) {
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (!inBounds(nr, nc)) continue;
      const target = state[nr][nc];
      if (!target || !isPieceColor(target, color)) {
        moves.push({ r: nr, c: nc, capture: !!target, promote: false });
      }
    }
  }

  const rights = ctx.castling ? ctx.castling[color] : null;
  if (!rights) return;
  const row = color === "w" ? 7 : 0;
  if (r !== row || c !== 4) return;

  if (rights.k && !state[row][5] && !state[row][6]) {
    moves.push({ r: row, c: 6, capture: false, promote: false, castle: "k" });
  }
  if (rights.q && !state[row][1] && !state[row][2] && !state[row][3]) {
    moves.push({ r: row, c: 2, capture: false, promote: false, castle: "q" });
  }
}

function isInCheck(state, color) {
  const kingPos = findKing(state, color);
  if (!kingPos) return false;
  const enemy = color === "w" ? "b" : "w";
  return isSquareAttacked(state, kingPos.r, kingPos.c, enemy);
}

function isSquareAttacked(state, r, c, byColor) {
  for (let rr = 0; rr < 8; rr += 1) {
    for (let cc = 0; cc < 8; cc += 1) {
      const piece = state[rr][cc];
      if (!piece || !isPieceColor(piece, byColor)) continue;
      const type = piece.toLowerCase();
      if (type === "p") {
        const dir = byColor === "w" ? -1 : 1;
        if (rr + dir === r && (cc - 1 === c || cc + 1 === c)) return true;
        continue;
      }
      if (type === "n") {
        const deltas = [
          [-2, -1],
          [-2, 1],
          [-1, -2],
          [-1, 2],
          [1, -2],
          [1, 2],
          [2, -1],
          [2, 1],
        ];
        for (const [dr, dc] of deltas) {
          if (rr + dr === r && cc + dc === c) return true;
        }
        continue;
      }
      if (type === "k") {
        if (Math.max(Math.abs(rr - r), Math.abs(cc - c)) === 1) return true;
        continue;
      }

      const directions = [];
      if (type === "b" || type === "q") {
        directions.push(
          [-1, -1],
          [-1, 1],
          [1, -1],
          [1, 1]
        );
      }
      if (type === "r" || type === "q") {
        directions.push(
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1]
        );
      }

      for (const [dr, dc] of directions) {
        let nr = rr + dr;
        let nc = cc + dc;
        while (inBounds(nr, nc)) {
          if (nr === r && nc === c) return true;
          if (state[nr][nc]) break;
          nr += dr;
          nc += dc;
        }
      }
    }
  }
  return false;
}

function findKing(state, color) {
  const target = color === "w" ? "K" : "k";
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      if (state[r][c] === target) return { r, c };
    }
  }
  return null;
}

function applyMoveWithContext(state, from, move, color, ctx) {
  const piece = state[from.r][from.c];
  state[from.r][from.c] = null;
  let newPiece = piece;
  if (move.promote) {
    const promoteTo = move.promoteTo || "q";
    newPiece = isUpper(piece) ? promoteTo.toUpperCase() : promoteTo;
  }
  if (move.enPassant) {
    const dir = color === "w" ? 1 : -1;
    state[move.r + dir][move.c] = null;
  }
  state[move.r][move.c] = newPiece;

  const nextCtx = {
    enPassant: ctx.enPassant ? { ...ctx.enPassant } : null,
    castling: {
      w: { ...ctx.castling.w },
      b: { ...ctx.castling.b },
    },
  };

  if (move.castle) {
    const row = color === "w" ? 7 : 0;
    if (move.castle === "k") {
      state[row][7] = null;
      state[row][5] = color === "w" ? "R" : "r";
    } else {
      state[row][0] = null;
      state[row][3] = color === "w" ? "R" : "r";
    }
  }

  nextCtx.enPassant = null;
  if (piece.toLowerCase() === "p" && Math.abs(from.r - move.r) === 2) {
    nextCtx.enPassant = { r: (from.r + move.r) / 2, c: from.c };
  }

  if (piece.toLowerCase() === "k") {
    nextCtx.castling[color].k = false;
    nextCtx.castling[color].q = false;
  }
  if (piece.toLowerCase() === "r") {
    if (color === "w" && from.r === 7 && from.c === 0) nextCtx.castling.w.q = false;
    if (color === "w" && from.r === 7 && from.c === 7) nextCtx.castling.w.k = false;
    if (color === "b" && from.r === 0 && from.c === 0) nextCtx.castling.b.q = false;
    if (color === "b" && from.r === 0 && from.c === 7) nextCtx.castling.b.k = false;
  }

  const captured = move.capture && !move.enPassant ? move : null;
  if (captured) {
    if (color === "w" && move.r === 0 && move.c === 0) nextCtx.castling.b.q = false;
    if (color === "w" && move.r === 0 && move.c === 7) nextCtx.castling.b.k = false;
    if (color === "b" && move.r === 7 && move.c === 0) nextCtx.castling.w.q = false;
    if (color === "b" && move.r === 7 && move.c === 7) nextCtx.castling.w.k = false;
  }

  return nextCtx;
}

function cloneBoard(state) {
  return state.map((row) => row.slice());
}

function inBounds(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function isUpper(ch) {
  return ch === ch.toUpperCase();
}

function isPieceColor(piece, color) {
  return color === "w" ? isUpper(piece) : !isUpper(piece);
}

function updateStatus() {
  const current = turn === "w" ? "White" : "Black";
  const hasMoves = hasAnyLegalMoves(turn);
  const inCheck = isInCheck(board, turn);

  if (!hasMoves && inCheck) {
    statusEl.textContent = `Checkmate! ${turn === "w" ? "Black" : "White"} wins.`;
  } else if (!hasMoves) {
    statusEl.textContent = "Stalemate.";
  } else if (inCheck) {
    statusEl.textContent = `${current} to move — Check!`;
  } else {
    statusEl.textContent = `${current} to move`;
  }
}

function hasAnyLegalMoves(color) {
  return hasAnyLegalMovesWithContext(color, board, { enPassant, castling });
}

function hasAnyLegalMovesWithContext(color, state, ctx) {
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const piece = state[r][c];
      if (piece && isPieceColor(piece, color)) {
        if (getLegalMovesWithContext(r, c, state, color, ctx).length > 0) {
          return true;
        }
      }
    }
  }
  return false;
}

function getAllLegalMoves(color) {
  return getAllLegalMovesForState(board, color, { enPassant, castling });
}

function getAllLegalMovesForState(state, color, ctx) {
  const moves = [];
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const piece = state[r][c];
      if (piece && isPieceColor(piece, color)) {
        const legal = getLegalMovesWithContext(r, c, state, color, ctx);
        for (const move of legal) moves.push({ from: { r, c }, move });
      }
    }
  }
  return moves;
}

function pieceValue(piece) {
  const map = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  return map[piece.toLowerCase()] || 0;
}

function chooseAIMove() {
  const aiColor = aiColorSelect.value;
  const moves = getAllLegalMoves(aiColor);
  if (!moves.length) return null;

  const level = Number(aiLevelSelect.value);
  if (level >= 3) {
    return chooseAIMoveMinimax(aiColor, moves, 3);
  }

  let bestScore = -Infinity;
  let bestMoves = [];

  for (const choice of moves) {
    const target = board[choice.move.r][choice.move.c];
    let score = 0;
    if (choice.move.enPassant) score += 1;
    if (target) score += pieceValue(target) * 2;

    if (level >= 2) {
      const next = cloneBoard(board);
      applyMoveWithContext(next, choice.from, choice.move, aiColor, {
        enPassant,
        castling,
      });
      if (isInCheck(next, aiColor === "w" ? "b" : "w")) score += 0.5;
    }

    score += Math.random() * 0.5;

    if (level === 1) {
      bestMoves.push(choice);
      continue;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMoves = [choice];
    } else if (score === bestScore) {
      bestMoves.push(choice);
    }
  }

  if (level === 1) {
    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
  }
  return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}

function chooseAIMoveMinimax(aiColor, moves, depth) {
  let bestScore = aiColor === "w" ? -Infinity : Infinity;
  let bestMoves = [];
  const ctx = { enPassant, castling };

  for (const choice of moves) {
    const nextState = cloneBoard(board);
    const nextCtx = applyMoveWithContext(
      nextState,
      choice.from,
      choice.move,
      aiColor,
      ctx
    );
    const score = minimax(
      nextState,
      aiColor === "w" ? "b" : "w",
      depth - 1,
      -Infinity,
      Infinity,
      nextCtx
    );
    if (aiColor === "w") {
      if (score > bestScore) {
        bestScore = score;
        bestMoves = [choice];
      } else if (score === bestScore) {
        bestMoves.push(choice);
      }
    } else {
      if (score < bestScore) {
        bestScore = score;
        bestMoves = [choice];
      } else if (score === bestScore) {
        bestMoves.push(choice);
      }
    }
  }

  return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}

function minimax(state, color, depth, alpha, beta, ctx) {
  if (depth === 0) {
    return evaluateBoard(state);
  }

  const moves = getAllLegalMovesForState(state, color, ctx);
  if (!moves.length) {
    if (isInCheck(state, color)) {
      return color === "w" ? -10000 : 10000;
    }
    return 0;
  }

  if (color === "w") {
    let value = -Infinity;
    for (const choice of moves) {
      const nextState = cloneBoard(state);
      const nextCtx = applyMoveWithContext(
        nextState,
        choice.from,
        choice.move,
        color,
        ctx
      );
      value = Math.max(
        value,
        minimax(nextState, "b", depth - 1, alpha, beta, nextCtx)
      );
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return value;
  }

  let value = Infinity;
  for (const choice of moves) {
    const nextState = cloneBoard(state);
    const nextCtx = applyMoveWithContext(
      nextState,
      choice.from,
      choice.move,
      color,
      ctx
    );
    value = Math.min(
      value,
      minimax(nextState, "w", depth - 1, alpha, beta, nextCtx)
    );
    beta = Math.min(beta, value);
    if (alpha >= beta) break;
  }
  return value;
}

function evaluateBoard(state) {
  let score = 0;
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const piece = state[r][c];
      if (!piece) continue;
      const val = pieceValue(piece);
      score += isUpper(piece) ? val : -val;
    }
  }
  return score;
}

function maybeMakeAIMove() {
  if (!aiToggle.checked) return;
  if (pendingPromotion) return;
  const aiColor = aiColorSelect.value;
  if (turn !== aiColor) return;
  if (!hasAnyLegalMoves(turn)) return;

  setTimeout(() => {
    const choice = chooseAIMove();
    if (!choice) return;
    if (choice.move.promote && !choice.move.promoteTo) {
      choice.move.promoteTo = "q";
    }
    makeMove(choice.from, choice.move);
    selected = null;
    legalMoves = [];
    renderBoard();
    updateStatus();
    if (turn === aiColor) {
      maybeMakeAIMove();
    }
  }, 250);
}

function showPromotion() {
  promotionModal.classList.remove("hidden");
}

function hidePromotion() {
  promotionModal.classList.add("hidden");
}

promotionModal.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-piece]");
  if (!button || !pendingPromotion) return;
  const piece = button.dataset.piece;
  pendingPromotion.move.promoteTo = piece;
  makeMove(pendingPromotion.from, pendingPromotion.move);
  pendingPromotion = null;
  hidePromotion();
  selected = null;
  legalMoves = [];
  renderBoard();
  updateStatus();
  maybeMakeAIMove();
});

resetBtn.addEventListener("click", () => initBoard());
flipBtn.addEventListener("click", () => {
  flipped = !flipped;
  renderBoard();
});

aiToggle.addEventListener("change", () => {
  maybeMakeAIMove();
});
aiColorSelect.addEventListener("change", () => {
  maybeMakeAIMove();
});

initBoard();
