import React from 'react';
import { useTranslation } from 'react-i18next';
import { AppFilterHeader } from '../../router-ui';
import './HelpDoc.css';

const RouterGuideDoc = () => {
  const { t } = useTranslation();

  return (
    <div className='dashboard-container'>
      <AppFilterHeader
        breadcrumbs={[
          { key: 'workspace', label: t('header.user_workspace') },
          { key: 'help', label: t('header.help') },
          { key: 'router-guide', label: t('header.router_guide'), active: true },
        ]}
        title={t('header.router_guide')}
      />
      <div className='router-help-doc-page'>
        <main className='storefront-content'>
          <div className='usage-doc-page'>
            <div className='doc-body'>
              <aside className='doc-sidebar'>
                <div className='toc-header'>目录</div>
                <div className='toc-divider' />
                <nav className='toc-items'>
                  <a href='#router-guide' className='toc-item toc-item--active'>
                    {t('header.router_guide')}
                  </a>
                  <a href='#router-guide-quickstart' className='toc-item toc-item--sub'>
                    快速开始
                  </a>
                  <a href='#router-guide-api' className='toc-item toc-item--sub'>
                    直接调用 API
                  </a>
                  <a href='#router-guide-routing' className='toc-item toc-item--sub'>
                    路由与计费
                  </a>
                  <a href='#router-guide-observe' className='toc-item toc-item--sub'>
                    查看额度与日志
                  </a>
                  <a href='#router-guide-troubleshooting' className='toc-item toc-item--sub'>
                    常见问题
                  </a>
                </nav>
              </aside>

              <main className='doc-content'>
                <section className='hero-section' id='router-guide'>
                  <div className='badge-row'>
                    <span className='badge-icon'>RT</span>
                    <span className='badge-label'>ROUTER GUIDE</span>
                  </div>
                  <h1 className='hero-title'>{t('header.router_guide')}</h1>
                  <p className='hero-subtitle'>
                    理解 Router 的统一入口、模型可见性、自动路由和统一记账。
                  </p>
                  <div className='section-divider' />
                </section>

                <section className='doc-section router-guide-section'>
                  <div className='section-heading'>
                    <span className='heading-icon' style={{ background: 'rgb(37, 99, 235)' }}>
                      RT
                    </span>
                    <div className='heading-text'>
                      <h2>Router 是什么</h2>
                      <span className='heading-tagline'>
                        先理解 Router，再选择客户端工具。
                      </span>
                    </div>
                  </div>
                  <div className='markdown-section'>
                    <p>
                      Router 是统一的模型调用入口。你使用一枚 Router 令牌和一个统一 Base
                      URL 发起请求，Router 根据你的分组、可用模型、渠道健康度和渠道策略选择真实上游，并记录额度、日志和计费明细。
                    </p>

                    <div className='router-guide-grid'>
                      <div className='router-guide-card'>
                        <strong>统一入口</strong>
                        <span>客户端面向 Router 调用，不需要直接管理每个上游厂商的 Key。</span>
                      </div>
                      <div className='router-guide-card'>
                        <strong>模型可见性</strong>
                        <span>
                          <code>/v1/models</code> 返回当前令牌真实可用的模型，而不是全站模型全集。
                        </span>
                      </div>
                      <div className='router-guide-card'>
                        <strong>自动路由</strong>
                        <span>
                          同一模型可命中不同渠道；Router 会按分组、优先级、端点能力和健康状态选择候选。
                        </span>
                      </div>
                      <div className='router-guide-card'>
                        <strong>统一记账</strong>
                        <span>请求会落入消费日志，额度按 YYC 结算，可在工作区查看明细。</span>
                      </div>
                    </div>

                    <h2 id='router-guide-quickstart'>快速开始</h2>
                    <ol>
                      <li>
                        进入 <a href='/workspace/token'>令牌</a> 页面，创建或复制你的 Router API
                        Key。
                      </li>
                      <li>
                        进入 <a href='/workspace/service/models'>模型</a>{' '}
                        页面，确认当前账号可用模型、供应商、端点和健康状态。
                      </li>
                      <li>
                        在客户端里配置 Base URL。OpenAI 兼容客户端通常使用{' '}
                        <code>https://router.yeying.pub/v1</code>；Claude / Anthropic
                        兼容客户端通常使用 <code>https://router.yeying.pub</code>。
                      </li>
                      <li>把 API Key 配到客户端的 Key 字段，选择模型后发起请求。</li>
                      <li>
                        进入 <a href='/workspace/log'>日志</a>{' '}
                        页面查看请求是否成功、命中渠道、消耗额度和错误原因。
                      </li>
                    </ol>

                    <blockquote>
                      <p>
                        建议先用 <code>/v1/models</code>{' '}
                        验证令牌与模型范围，再配置 Codex、Claude Code、Gemini CLI 等客户端工具。
                      </p>
                    </blockquote>

                    <h2 id='router-guide-api'>直接调用 API</h2>
                    <p>如果你不使用现成客户端，也可以直接按 OpenAI / Anthropic 兼容协议调用 Router。</p>
                    <table className='router-guide-endpoint-table'>
                      <thead>
                        <tr>
                          <th>用途</th>
                          <th>端点</th>
                          <th>说明</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>模型列表</td>
                          <td>
                            <code>GET /v1/models</code>
                          </td>
                          <td>
                            返回当前令牌可见模型，包含 <code>owned_by</code>、<code>tags</code>、
                            <code>supported_endpoints</code>。
                          </td>
                        </tr>
                        <tr>
                          <td>Responses</td>
                          <td>
                            <code>POST /v1/responses</code>
                          </td>
                          <td>推荐的新文本端点，适合支持 Responses 的模型。</td>
                        </tr>
                        <tr>
                          <td>Chat Completions</td>
                          <td>
                            <code>POST /v1/chat/completions</code>
                          </td>
                          <td>兼容旧 OpenAI 客户端和多数通用工具。</td>
                        </tr>
                        <tr>
                          <td>Messages</td>
                          <td>
                            <code>POST /v1/messages</code>
                          </td>
                          <td>Anthropic / Claude 兼容端点。</td>
                        </tr>
                      </tbody>
                    </table>

                    <pre>
                      <code className='language-bash'>{`curl https://router.yeying.pub/v1/models \\
  -H "Authorization: Bearer your-api-key-here"`}</code>
                    </pre>

                    <pre>
                      <code className='language-bash'>{`curl https://router.yeying.pub/v1/responses \\
  -H "Authorization: Bearer your-api-key-here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "your-model-name",
    "input": "用一句话介绍 Router 的作用"
  }'`}</code>
                    </pre>

                    <h2 id='router-guide-routing'>路由与计费</h2>
                    <ul>
                      <li>
                        <strong>模型名是入口</strong>
                        ：客户端传入模型名，Router 根据用户分组查找可用渠道和上游模型映射。
                      </li>
                      <li>
                        <strong>端点必须匹配</strong>
                        ：模型可能只支持部分端点；如果不确定，优先查看模型页的{' '}
                        <code>supported_endpoints</code>。
                      </li>
                      <li>
                        <strong>渠道会自动切换</strong>
                        ：上游超时、异常或不可用时，Router
                        会按策略尝试其他候选；候选耗尽后才把错误返回给客户端。
                      </li>
                      <li>
                        <strong>计费以日志为准</strong>
                        ：最终消耗会写入消费日志，展示价格单位、币种、倍率、折算 YYC、套餐或余额来源。
                      </li>
                    </ul>

                    <h2 id='router-guide-observe'>查看额度与日志</h2>
                    <ul>
                      <li>
                        <a href='/workspace/topup?tab=quota'>我的额度</a>
                        ：查看余额、套餐额度、应急额度和历史消耗。
                      </li>
                      <li>
                        <a href='/workspace/service/models'>模型</a>
                        ：查看模型健康度、可用端点、供应商和能力标签。
                      </li>
                      <li>
                        <a href='/workspace/log'>日志</a>
                        ：查看每次请求的模型、渠道、耗时、用量、金额、错误和结算来源。
                      </li>
                      <li>
                        <a href='/workspace/token'>令牌</a>
                        ：管理 API Key，建议不同客户端使用不同令牌，便于排查和控制。
                      </li>
                    </ul>

                    <h2 id='router-guide-troubleshooting'>常见问题</h2>
                    <ul>
                      <li>
                        <strong>401 / 认证失败</strong>
                        ：检查 API Key 是否复制完整，Authorization 是否为{' '}
                        <code>Bearer your-api-key-here</code>。
                      </li>
                      <li>
                        <strong>模型不存在</strong>
                        ：先调用 <code>/v1/models</code> 或查看模型页，确认当前令牌和分组是否有该模型。
                      </li>
                      <li>
                        <strong>端点不支持</strong>
                        ：切换到模型页显示的可用端点，例如 Responses、Messages 或 Chat Completions。
                      </li>
                      <li>
                        <strong>额度不足</strong>
                        ：进入额度页查看余额和套餐状态，必要时充值或联系管理员调整分组。
                      </li>
                      <li>
                        <strong>503 / 上游不可用</strong>
                        ：通常表示当前模型候选渠道不可用或全部失败，可以稍后重试或换模型。
                      </li>
                    </ul>
                  </div>
                </section>
              </main>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default RouterGuideDoc;
