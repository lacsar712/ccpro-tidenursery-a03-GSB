import { FormEvent, useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Pond, SalinityStep } from '../types'

function toLocalInput(iso: string) {
  const d = new Date(iso)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

function nowLocal() {
  return toLocalInput(new Date().toISOString())
}

export default function SalinityAcclimation() {
  const [ponds, setPonds] = useState<Pond[]>([])
  const [steps, setSteps] = useState<SalinityStep[]>([])
  const [form, setForm] = useState({
    pondId: 0,
    stepNo: 1,
    targetSalinityPpt: 25,
    plannedAt: nowLocal(),
  })
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  async function load() {
    const [ps, ss] = await Promise.all([
      api<Pond[]>('/api/ponds'),
      api<SalinityStep[]>('/api/salinity-steps'),
    ])
    setPonds(ps)
    setSteps(ss)
    if (!form.pondId) {
      const q = ps.find((p) => p.status === 'quarantine')
      if (q) {
        setForm((f) => ({ ...f, pondId: q.id, stepNo: nextStepNo(ss, q.id) }))
      }
    }
    return { ps, ss }
  }

  function nextStepNo(all: SalinityStep[], pondId: number) {
    const nos = all.filter((s) => s.pondId === pondId).map((s) => s.stepNo)
    return nos.length ? Math.max(...nos) + 1 : 1
  }

  useEffect(() => {
    load().catch((e) => setError(e.message))
  }, [])

  function pickPond(pondId: number) {
    setForm((f) => ({ ...f, pondId, stepNo: nextStepNo(steps, pondId) }))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    try {
      await api('/api/salinity-steps', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          plannedAt: new Date(form.plannedAt).toISOString(),
        }),
      })
      const { ss } = await load()
      setForm((f) => ({ ...f, stepNo: nextStepNo(ss, f.pondId), plannedAt: nowLocal() }))
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    }
  }

  async function complete(id: number) {
    setError('')
    setInfo('')
    try {
      await api(`/api/salinity-steps/${id}/complete`, { method: 'POST' })
      setInfo('阶梯已完成')
      const [ps, ss] = await Promise.all([
        api<Pond[]>('/api/ponds'),
        api<SalinityStep[]>('/api/salinity-steps'),
      ])
      setPonds(ps)
      setSteps(ss)
    } catch (err) {
      setError(err instanceof Error ? err.message : '完成失败')
    }
  }

  async function stock(pondId: number) {
    if (!confirm('确认全部阶梯已完成，将该塘口转为在养(stocked)？')) return
    setError('')
    setInfo('')
    try {
      await api(`/api/ponds/${pondId}/stock`, { method: 'POST' })
      setInfo('塘口已放养，状态改为在养')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '放养失败')
    }
  }

  const quarantinePonds = ponds.filter((p) => p.status === 'quarantine')
  const pondOf = (id: number) => ponds.find((p) => p.id === id)
  const pondLabel = (id: number) => {
    const p = pondOf(id)
    return p ? `${p.pondCode} · ${p.species}` : `#${id}`
  }

  // 每个隔离塘的阶梯完成情况，用于“放养”区
  const stockable = quarantinePonds
    .map((p) => {
      const ps = steps.filter((s) => s.pondId === p.id).sort((a, b) => a.stepNo - b.stepNo)
      return { pond: p, steps: ps, done: ps.length > 0 && ps.every((s) => s.completedAt) }
    })
    .filter((x) => x.steps.length > 0)

  return (
    <div>
      <header className="page-header">
        <h1>盐度驯化阶梯</h1>
        <p className="muted">
          仅隔离(quarantine)塘口可建阶梯；完成某阶须在其计划时刻前后 2
          小时内存在盐度与目标盐度相差不超过 1 ppt 的水质样；须按序号自低到高完成；全部完成后方可放养转在养。
        </p>
      </header>
      {error && <div className="error">{error}</div>}
      {info && <div className="info">{info}</div>}

      <form className="panel form-grid" onSubmit={onSubmit}>
        <label>
          隔离塘口
          <select
            value={form.pondId}
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
          阶梯序号（从 1 起，同塘唯一）
          <input
            type="number"
            min={1}
            step={1}
            value={form.stepNo}
            onChange={(e) => setForm({ ...form, stepNo: Number(e.target.value) })}
            required
          />
        </label>
        <label>
          目标盐度 ppt
          <input
            type="number"
            step="0.1"
            min={0}
            value={form.targetSalinityPpt}
            onChange={(e) =>
              setForm({ ...form, targetSalinityPpt: Number(e.target.value) })
            }
            required
          />
        </label>
        <label>
          计划时刻
          <input
            type="datetime-local"
            value={form.plannedAt}
            onChange={(e) => setForm({ ...form, plannedAt: e.target.value })}
            required
          />
        </label>
        <button type="submit" className="btn primary" disabled={!form.pondId}>
          新建阶梯
        </button>
      </form>

      {stockable.length > 0 && (
        <div className="panel">
          <strong>完成驯化后放养</strong>
          <div className="stock-row">
            {stockable.map(({ pond, steps: ps, done }) => (
              <div key={pond.id} className="stock-card">
                <div>
                  {pond.pondCode} · {pond.species}（{ps.filter((s) => s.completedAt).length}/
                  {ps.length} 阶已完成）
                </div>
                <button
                  className="btn primary"
                  disabled={!done}
                  title={done ? '全部阶梯完成，可放养' : '仍有未完成阶梯'}
                  onClick={() => stock(pond.id)}
                >
                  放养转在养
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>塘口</th>
              <th>序号</th>
              <th>目标盐度 ppt</th>
              <th>计划时刻</th>
              <th>完成时刻</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {steps.map((s) => {
              const p = pondOf(s.pondId)
              const lowerPending = steps.some(
                (x) =>
                  x.pondId === s.pondId &&
                  x.stepNo < s.stepNo &&
                  !x.completedAt,
              )
              return (
                <tr key={s.id}>
                  <td>{s.id}</td>
                  <td>
                    {pondLabel(s.pondId)}
                    {p && <span className={`badge ${p.status}`}>{p.status}</span>}
                  </td>
                  <td>第 {s.stepNo} 阶</td>
                  <td>{s.targetSalinityPpt}</td>
                  <td>{new Date(s.plannedAt).toLocaleString()}</td>
                  <td>{s.completedAt ? new Date(s.completedAt).toLocaleString() : '—'}</td>
                  <td>
                    {!s.completedAt && (
                      <button
                        className="btn ghost"
                        title={
                          lowerPending
                            ? '存在更低序号未完成阶梯'
                            : '需在计划时刻 ±2h 内有盐度达标水质样'
                        }
                        onClick={() => complete(s.id)}
                      >
                        完成
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
            {steps.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  暂无驯化阶梯，请先为隔离塘口新建。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
