import { FormEvent, useEffect, useState } from 'react'
import { api } from '../api/client'
import type { AcclimationStep, Pond } from '../types'

function nowLocal() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export default function Acclimation() {
  const [ponds, setPonds] = useState<Pond[]>([])
  const [steps, setSteps] = useState<AcclimationStep[]>([])
  const [pondId, setPondId] = useState(0)
  const [stepOrder, setStepOrder] = useState(1)
  const [targetSalinity, setTargetSalinity] = useState(30)
  const [plannedAt, setPlannedAt] = useState(nowLocal())
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function load() {
    const [ps, ss] = await Promise.all([
      api<Pond[]>('/api/ponds'),
      api<AcclimationStep[]>('/api/acclimation-steps'),
    ])
    setPonds(ps)
    setSteps(ss)
    const stillQuarantine = ps.find((p) => p.id === pondId && p.status === 'quarantine')
    if (!stillQuarantine) {
      const first = ps.find((p) => p.status === 'quarantine')
      if (first) {
        setPondId(first.id)
        setStepOrder(nextOrder(first.id, ss))
      }
    }
  }

  function nextOrder(id: number, ss: AcclimationStep[]) {
    const orders = ss.filter((s) => s.pondId === id).map((s) => s.stepOrder)
    return orders.length ? Math.max(...orders) + 1 : 1
  }

  useEffect(() => {
    load().catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function pickPond(id: number) {
    setPondId(id)
    setStepOrder(nextOrder(id, steps))
    setError('')
    setNotice('')
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setError('')
    setNotice('')
    try {
      await api('/api/acclimation-steps', {
        method: 'POST',
        body: JSON.stringify({
          pondId,
          stepOrder,
          targetSalinityPpt: targetSalinity,
          plannedAt: new Date(plannedAt).toISOString(),
        }),
      })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败')
    }
  }

  async function onComplete(s: AcclimationStep) {
    setError('')
    setNotice('')
    try {
      await api(`/api/acclimation-steps/${s.id}/complete`, { method: 'POST' })
      setNotice(`阶梯 ${s.stepOrder} 已完成`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '完成失败')
    }
  }

  async function onStock(p: Pond) {
    if (!confirm(`确认将塘口 ${p.pondCode} 转为在养（放养）？`)) return
    setError('')
    setNotice('')
    try {
      await api(`/api/ponds/${p.id}/stock`, { method: 'POST' })
      setNotice(`塘口 ${p.pondCode} 已放养，状态转为在养`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '放养失败')
    }
  }

  const pondLabel = (id: number) => {
    const p = ponds.find((x) => x.id === id)
    return p ? `${p.pondCode} (${p.species})` : `#${id}`
  }

  // 每个塘口的阶梯完成情况，用于决定放养按钮可用性
  const progressByPond = new Map<number, { total: number; done: number }>()
  for (const s of steps) {
    const cur = progressByPond.get(s.pondId) ?? { total: 0, done: 0 }
    cur.total += 1
    if (s.completedAt) cur.done += 1
    progressByPond.set(s.pondId, cur)
  }

  const quarantinePonds = ponds.filter((p) => p.status === 'quarantine')
  const selectedPond = ponds.find((p) => p.id === pondId)

  return (
    <div>
      <header className="page-header">
        <h1>盐度驯化阶梯</h1>
        <p className="muted">
          仅隔离(quarantine)塘口可建阶梯；按序号依次完成；完成某阶须在计划时刻前后
          2 小时内有盐度与目标相差不超过 1 的水质样；全部完成后方可放养。
        </p>
      </header>
      {error && <div className="error">{error}</div>}
      {notice && <div className="success">{notice}</div>}

      <form className="panel form-grid" onSubmit={onCreate}>
        <label>
          隔离塘口
          <select
            value={pondId}
            onChange={(e) => pickPond(Number(e.target.value))}
            required
          >
            {quarantinePonds.length === 0 && <option value={0}>暂无隔离塘口</option>}
            {quarantinePonds.map((p) => (
              <option key={p.id} value={p.id}>
                {p.pondCode} · {p.species}
              </option>
            ))}
          </select>
        </label>
        <label>
          阶梯序号（从 1 起）
          <input
            type="number"
            min={1}
            step={1}
            value={stepOrder}
            onChange={(e) => setStepOrder(Number(e.target.value))}
            required
          />
        </label>
        <label>
          目标盐度 ppt
          <input
            type="number"
            step="0.1"
            min={0}
            value={targetSalinity}
            onChange={(e) => setTargetSalinity(Number(e.target.value))}
            required
          />
        </label>
        <label>
          计划时刻
          <input
            type="datetime-local"
            value={plannedAt}
            onChange={(e) => setPlannedAt(e.target.value)}
            required
          />
        </label>
        <button
          type="submit"
          className="btn primary"
          disabled={!selectedPond || selectedPond.status !== 'quarantine'}
        >
          新建阶梯
        </button>
      </form>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>塘口</th>
              <th>序号</th>
              <th>目标盐度</th>
              <th>计划时刻</th>
              <th>完成时刻</th>
              <th>状态</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {steps
              .slice()
              .sort((a, b) =>
                a.pondId === b.pondId
                  ? a.stepOrder - b.stepOrder
                  : a.pondId - b.pondId,
              )
              .map((s) => {
                return (
                  <tr key={s.id}>
                    <td>{s.id}</td>
                    <td>{pondLabel(s.pondId)}</td>
                    <td>{s.stepOrder}</td>
                    <td>{s.targetSalinityPpt} ppt</td>
                    <td>{new Date(s.plannedAt).toLocaleString()}</td>
                    <td>{s.completedAt ? new Date(s.completedAt).toLocaleString() : '—'}</td>
                    <td>
                      <span className={`badge ${s.completedAt ? 'stocked' : 'quarantine'}`}>
                        {s.completedAt ? '已完成' : '待完成'}
                      </span>
                    </td>
                    <td>
                      {!s.completedAt && (
                        <button className="btn ghost" onClick={() => onComplete(s)}>
                          完成阶梯
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            {steps.length === 0 && (
              <tr>
                <td colSpan={8} className="muted" style={{ textAlign: 'center' }}>
                  暂无驯化阶梯
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">放养</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>塘口</th>
              <th>状态</th>
              <th>阶梯进度</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ponds
              .filter((p) => progressByPond.has(p.id))
              .map((p) => {
                const prog = progressByPond.get(p.id)!
                const allDone = prog.total === prog.done
                return (
                  <tr key={p.id}>
                    <td>
                      {p.pondCode} · {p.species}
                    </td>
                    <td>
                      <span className={`badge ${p.status}`}>{p.status}</span>
                    </td>
                    <td>
                      {prog.done} / {prog.total} 已完成
                    </td>
                    <td>
                      {p.status === 'quarantine' && allDone && (
                        <button className="btn primary" onClick={() => onStock(p)}>
                          放养（转为在养）
                        </button>
                      )}
                      {p.status === 'quarantine' && !allDone && (
                        <span className="muted">仍有未完成阶梯，不可放养</span>
                      )}
                      {p.status !== 'quarantine' && <span className="muted">非隔离塘口</span>}
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
