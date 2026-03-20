from collections import defaultdict

from fastapi import WebSocket


class TournamentConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect(self, tournament_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections[tournament_id].add(websocket)

    def disconnect(self, tournament_id: str, websocket: WebSocket) -> None:
        connections = self._connections.get(tournament_id)
        if not connections:
            return
        connections.discard(websocket)
        if not connections:
            self._connections.pop(tournament_id, None)

    async def broadcast(self, tournament_id: str, payload: dict) -> None:
        dead_connections: list[WebSocket] = []
        for connection in self._connections.get(tournament_id, set()):
            try:
                await connection.send_json(payload)
            except Exception:
                dead_connections.append(connection)

        for connection in dead_connections:
            self.disconnect(tournament_id, connection)


manager = TournamentConnectionManager()
