import * as moves from './moves'
import * as state from './state'
import * as util from './util'
import * as immutable from 'immutable'

class ConstructorKey {}

abstract class Square {
  constructor (_key: ConstructorKey) {
    if (typeof this.isOccupied !== 'function') {
      throw new Error('isOccupied function not defined')
    }

    if (typeof this.canMoveOnto !== 'function') {
      throw new Error('canMoveOnto function not defined')
    }

    if (typeof this.canBeCaptured !== 'function') {
      throw new Error('canBeCaptured function not defined')
    }
  }

  abstract isOccupied (): this is Piece;
  abstract canMoveOnto (piece: Piece): boolean;
  abstract canBeCaptured (piece: Piece): boolean;
}

class EmptySquare extends Square {
  isOccupied () {
    return false
  }

  canMoveOnto (_other: Piece) {
    return true
  }

  canBeCaptured (_other: Piece) {
    return false
  }
}

function moveLine (state: state.State, piece: Piece, fromPos: util.Pos, line: [number, number]) {
  const moveList = []
  let toPos = fromPos.add(line[0], line[1])
  while (toPos && state.board.get(toPos).canMoveOnto(piece)) {
    moveList.push(new moves.NormalMove(state, piece, fromPos, toPos))
    // Once the piece hits another piece stop
    if (state.board.get(toPos).canBeCaptured(piece)) {
      break
    }
    toPos = toPos.add(line[0], line[1])
  }
  return moveList
}

abstract class Piece extends Square {
  color: Readonly<Color>
  fenLetter: string

  constructor (key: ConstructorKey, color: Readonly<Color>, fenLetter: string) {
    super(key)

    if (typeof this.moves !== 'function') {
      throw new Error('Moves function not defined')
    }
    if (typeof this.getPGNLetter !== 'function') {
      throw new Error('Get pgn letter not defined')
    }

    this.color = color
    this.fenLetter = fenLetter
  }

  isOccupied () {
    return true
  }

  canMoveOnto (other: Piece) {
    return this.color !== other.color
  }

  canBeCaptured (other: Piece) {
    return this.canMoveOnto(other)
  }

  abstract moves (state: state.State, myPos: util.Pos): moves.Move[]
  abstract getPGNLetter(): string
}

class Pawn extends Piece {
  addMove (state: state.State, moveList: moves.Move[], fromPos: util.Pos, toPos: util.Pos) {
    if (toPos.rank === this.color.OTHER_COLOR.KING_RANK) {
      for (const choice of this.color.PROMOTE_LIST) {
        moveList.push(new moves.Promotion(state, this, fromPos, toPos, choice))
      }
    } else {
      moveList.push(new moves.NormalMove(state, this, fromPos, toPos))
    }
  }

  getPGNLetter () {
    return ''
  }

  moves (state: state.State, myPos: util.Pos) {
    const moveList: moves.Move[] = []
    const forwardMove = myPos.addRank(this.color.PAWN_RANK_DIR)

    if (!forwardMove) {
      return moveList
    }
    const forwardOccupied = state.board.get(forwardMove!).isOccupied()
    if (!forwardOccupied) {
      this.addMove(state, moveList, myPos, forwardMove!)
    }
    if (!forwardOccupied && this.color.PAWN_RANK === myPos.rank) {
      const firstMove = myPos.addRank(this.color.PAWN_RANK_DIR * 2)
      console.assert(firstMove, 'First move should be in bounds')
      if (!state.board.get(firstMove!).isOccupied()) {
        moveList.push(new moves.FirstPawn(state, this, myPos, firstMove!))
      }
    }
    const otherColor = state.getColor(this.color.OTHER_COLOR)
    const leftDiag = myPos.add(-1, this.color.PAWN_RANK_DIR)

    if (leftDiag && state.board.get(leftDiag).canBeCaptured(this)) {
      this.addMove(state, moveList, myPos, leftDiag)
    }
    const rightDiag = myPos.add(1, this.color.PAWN_RANK_DIR)
    if (rightDiag && state.board.get(rightDiag).canBeCaptured(this)) {
      this.addMove(state, moveList, myPos, rightDiag)
    }
    if (otherColor.enPassantPos) {
      if (leftDiag && otherColor.enPassantPos.compare(leftDiag) === 0) {
        moveList.push(new moves.EnPassant(state, this, myPos, leftDiag))
      }
      if (rightDiag && otherColor.enPassantPos.compare(rightDiag) === 0) {
        moveList.push(new moves.EnPassant(state, this, myPos, rightDiag))
      }
    }

    return moveList
  }
}

class Rook extends Piece {
  moves (state: state.State, pos: util.Pos): moves.Move[] {
    const line: [number, number][] = [[0, 1], [0, -1], [1, 0], [-1, 0]]
    return (line
      .map(line => moveLine(state, this, pos, line))
      .reduce((acc, val) => acc.concat(val)))
  }

  getPGNLetter () {
    return 'R'
  }
}

class Knight extends Piece {
  moves (state: state.State, pos: util.Pos): moves.Move[] {
    const knightPos = [[1, 2], [-1, 2], [1, -2], [-1, -2], [2, 1], [-2, 1], [2, -1], [-2, -1]]
    const moveList = []
    for (const deltaPos of knightPos) {
      const newPos = pos.add(deltaPos[0], deltaPos[1])
      if (newPos && state.board.get(newPos).canMoveOnto(this)) {
        moveList.push(new moves.NormalMove(state, this, pos, newPos))
      }
    }
    return moveList
  }

  getPGNLetter () {
    return 'N'
  }
}

class Bishop extends Piece {
  moves (state: state.State, pos: util.Pos): moves.Move[] {
    const line: [number, number][] = [[1, 1], [-1, -1], [1, -1], [-1, 1]]
    return (line
      .map(line => moveLine(state, this, pos, line))
      .reduce((acc, val) => acc.concat(val)))
  }

  getPGNLetter () {
    return 'B'
  }
}

class Queen extends Piece {
  moves (state: state.State, pos: util.Pos) {
    return Bishop.prototype.moves.call(this, state, pos).concat(Rook.prototype.moves.call(this, state, pos))
  }

  getPGNLetter () {
    return 'Q'
  }
}

class King extends Piece {
  moves (state: state.State, pos: util.Pos): moves.Move[] {
    const kingPos = [[1, 0], [1, 1], [-1, 0], [-1, -1], [1, -1], [-1, 1], [0, 1], [0, -1]]
    const moveList = []
    for (const deltaPos of kingPos) {
      const newPos = pos.add(deltaPos[0], deltaPos[1])
      if (newPos && state.board.get(newPos).canMoveOnto(this)) {
        moveList.push(new moves.NormalMove(state, this, pos, newPos))
      }
    }
    return moveList
  }

  getPGNLetter () {
    return 'K'
  }
}

// Pseudo piece that allows itself to be captured to help with castling though check with a pawn
class Wall extends Piece {
  moves (_state: state.State, _pos: util.Pos) {
    return []
  }

  getPGNLetter (): string {
    throw new Error('Not a real piece')
  }
}

export interface Color {
  PAWN: Readonly<Piece>,
  ROOK: Readonly<Piece>,
  KNIGHT: Readonly<Piece>,
  BISHOP: Readonly<Piece>,
  QUEEN: Readonly<Piece>,
  KING: Readonly<Piece>,
  WALL: Readonly<Piece>,
  KING_RANK: number,
  PAWN_RANK: number,
  PAWN_RANK_DIR: number,
  PROMOTE_LIST: Readonly<Readonly<Piece>[]>
  FROM_LETTER: immutable.Map<string, Readonly<Piece>>,
  OTHER_COLOR: Readonly<Color>,
}

function genColor (kingRank: number, pawnRank: number, pawnRankDir: number, fenConv: (l: string) => string) {
  const ret = {} as Color
  const key = new ConstructorKey()
  Object.assign(ret, {
    PAWN: Object.freeze(new Pawn(key, ret, fenConv('P'))),
    ROOK: Object.freeze(new Rook(key, ret, fenConv('R'))),
    KNIGHT: Object.freeze(new Knight(key, ret, fenConv('N'))),
    BISHOP: Object.freeze(new Bishop(key, ret, fenConv('B'))),
    QUEEN: Object.freeze(new Queen(key, ret, fenConv('Q'))),
    KING: Object.freeze(new King(key, ret, fenConv('K'))),
    WALL: Object.freeze(new Wall(key, ret, fenConv(''))),
    KING_RANK: kingRank,
    PAWN_RANK: pawnRank,
    PAWN_RANK_DIR: pawnRankDir
  })
  ret.PROMOTE_LIST = Object.freeze([ret.QUEEN, ret.KNIGHT, ret.ROOK, ret.BISHOP])
  const fromLetter: [string, Piece][] = [['K', ret.KING], ['Q', ret.QUEEN], ['R', ret.ROOK],
    ['B', ret.BISHOP], ['N', ret.KNIGHT], ['', ret.PAWN]]
  ret.FROM_LETTER = immutable.Map(fromLetter)
  return ret
}

const WRITABLE_WHITE = genColor(0, 1, 1, x => x)
const WRITABLE_BLACK = genColor(7, 6, -1, x => x.toLowerCase())
WRITABLE_WHITE.OTHER_COLOR = WRITABLE_BLACK
Object.freeze(WRITABLE_WHITE)
WRITABLE_BLACK.OTHER_COLOR = WRITABLE_WHITE
Object.freeze(WRITABLE_BLACK)

const WHITE: Readonly<Color> = WRITABLE_WHITE
const BLACK: Readonly<Color> = WRITABLE_BLACK

const FROM_FEN_ARRAY: [string, Readonly<Piece>][] = [['K', WHITE.KING], ['Q', WHITE.QUEEN], ['R', WHITE.ROOK],
  ['B', WHITE.BISHOP], ['N', WHITE.KNIGHT], ['P', WHITE.PAWN],
  ['k', BLACK.KING], ['q', BLACK.QUEEN], ['r', BLACK.ROOK],
  ['b', BLACK.BISHOP], ['n', BLACK.KNIGHT], ['p', BLACK.PAWN]]

const FROM_FEN = immutable.Map(FROM_FEN_ARRAY)

const EMPTY = Object.freeze(new EmptySquare(new ConstructorKey()))

export {
  EMPTY,
  WHITE,
  BLACK,
  FROM_FEN,
  Piece,
  Square
}
