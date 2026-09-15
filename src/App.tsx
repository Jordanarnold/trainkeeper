import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import GamesList from './screens/GamesList'
import NewGame from './screens/NewGame'
import Board from './screens/Board'
import RoundSheet from './screens/RoundSheet'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<GamesList />} />
        <Route path="/new" element={<NewGame />} />
        <Route path="/game/:id" element={<Board />}>
          <Route path="round/new" element={<RoundSheet />} />
          <Route path="round/:roundId" element={<RoundSheet />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}
