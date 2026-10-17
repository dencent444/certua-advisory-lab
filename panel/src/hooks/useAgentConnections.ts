import { useEffect, useState, type FormEvent } from 'react'
import type { Agent, AgentView, ConnectionData, Language, LoadState, Page } from '../models'
import { translations } from '../translations'

export function useAgentConnections(page: Page, view: AgentView, language: Language) {
  const [connection, setConnection] = useState<ConnectionData | null>(null)
  const [checkingPort, setCheckingPort] = useState(false)
  const [agents, setAgents] = useState<Agent[]>([])
  const [agentsState, setAgentsState] = useState<LoadState>('loading')
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [disconnectingAgentId, setDisconnectingAgentId] = useState<string | null>(null)
  const [agentActionError, setAgentActionError] = useState('')
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? agents[0]

  async function loadConnection(check: boolean) {
    if (check) setCheckingPort(true)
    try {
      const response = await fetch(`/api/connection${check ? '?check=1' : ''}`, {
        cache: 'no-store',
      })
      if (!response.ok) throw new Error('connection request failed')
      setConnection((await response.json()) as ConnectionData)
    } catch {
      setConnection(null)
    } finally {
      if (check) setCheckingPort(false)
    }
  }

  async function saveSiemHost(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault()
    const host = String(new FormData(event.currentTarget).get('host') ?? '').trim()
    setAgentActionError('')
    try {
      const response = await fetch('/api/agents/siem-host', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, host }),
      })
      if (!response.ok) throw new Error('host mapping failed')
      setAgents((current) =>
        current.map((agent) => (agent.id === id ? { ...agent, siemHost: host } : agent)),
      )
    } catch {
      setAgentActionError(
        language === 'uk' ? 'Не вдалося зберегти хост SIEM.' : 'Could not save the SIEM host.',
      )
    }
  }

  async function disconnectAgent(id: string) {
    setDisconnectingAgentId(id)
    setAgentActionError('')
    try {
      const response = await fetch('/api/agents/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!response.ok) throw new Error('disconnect failed')
      setAgents((current) => current.filter((agent) => agent.id !== id))
      setConnection((current) =>
        current
          ? { ...current, agents: current.agents.filter((agent) => agent.id !== id) }
          : current,
      )
      setSelectedAgentId(null)
    } catch {
      setAgentActionError(translations[language].disconnectError)
    } finally {
      setDisconnectingAgentId(null)
    }
  }

  useEffect(() => {
    if (page !== 'agents' || view !== 'connect') return
    void loadConnection(false)
    const timer = window.setInterval(() => {
      void loadConnection(false)
    }, 5000)
    return () => window.clearInterval(timer)
  }, [page, view])

  useEffect(() => {
    if (page !== 'agents') return
    const controller = new AbortController()
    async function loadAgents() {
      try {
        const response = await fetch('/api/agents', {
          signal: controller.signal,
          cache: 'no-store',
        })
        if (!response.ok) throw new Error('agent request failed')
        const data = (await response.json()) as { agents: Agent[] }
        setAgents(Array.isArray(data.agents) ? data.agents : [])
        setAgentsState('ready')
      } catch {
        if (!controller.signal.aborted) setAgentsState('error')
      }
    }
    setAgentsState('loading')
    void loadAgents()
    const timer = window.setInterval(() => {
      void loadAgents()
    }, 5000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [page])

  return {
    connection,
    checkingPort,
    agents,
    setAgents,
    agentsState,
    selectedAgent,
    selectedAgentId,
    setSelectedAgentId,
    disconnectingAgentId,
    agentActionError,
    loadConnection,
    saveSiemHost,
    disconnectAgent,
  }
}
