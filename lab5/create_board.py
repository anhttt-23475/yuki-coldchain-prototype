"""LAB-5: tạo GitHub Project (v2) + issue Epic/Task/Subtask từ lab5/backlog.json.
Chạy bằng GitHub Actions (workflow lab5-board.yml) với secret PROJECT_TOKEN (classic PAT: repo, project).
Chạy lại an toàn: nếu Project cùng tên đã tồn tại thì dừng, không tạo trùng."""
import json, os, sys, time, urllib.request

TOKEN = os.environ['GH_TOKEN']
OWNER, REPO = os.environ['GITHUB_REPOSITORY'].split('/')
TITLE = 'Yuki Cold Chain WMS – LAB-5 Backlog'
B = json.load(open(os.path.join(os.path.dirname(__file__), 'backlog.json'), encoding='utf-8'))


def call(method, url, data=None, accept='application/vnd.github+json'):
    req = urllib.request.Request(url, method=method, data=json.dumps(data).encode() if data is not None else None,
                                 headers={'Authorization': f'Bearer {TOKEN}', 'Accept': accept, 'X-GitHub-Api-Version': '2022-11-28',
                                          'Content-Type': 'application/json'})
    for i in range(5):
        try:
            with urllib.request.urlopen(req) as r:
                body = r.read()
                return json.loads(body) if body else {}
        except urllib.error.HTTPError as e:
            msg = e.read().decode()
            if e.code in (403, 429, 502) and i < 4:
                time.sleep(10 * (i + 1)); continue
            if e.code == 422 and 'already_exists' in msg:
                return {}
            raise SystemExit(f'{method} {url} -> {e.code} {msg}')


def gql(q, **v):
    r = call('POST', 'https://api.github.com/graphql', {'query': q, 'variables': v})
    if r.get('errors'):
        raise SystemExit(json.dumps(r['errors'], ensure_ascii=False))
    return r['data']


REST = f'https://api.github.com/repos/{OWNER}/{REPO}'
me = gql('query($l:String!){user(login:$l){id projectsV2(first:50){nodes{title number}}} }', l=OWNER)['user']
if any(p['title'] == TITLE for p in me['projectsV2']['nodes']):
    sys.exit('Project đã tồn tại → dừng để không tạo trùng.')
repo_id = gql('query($o:String!,$n:String!){repository(owner:$o,name:$n){id}}', o=OWNER, n=REPO)['repository']['id']

# ---- labels
LABELS = {'type:epic': '5319e7', 'type:task': '0e8a16', 'type:subtask': 'c2e0c6', '業務制約': 'd93f0b', '2024年問題': 'b60205'}
for name, color in LABELS.items():
    call('POST', f'{REST}/labels', {'name': name, 'color': color})

# ---- project + fields
p = gql('mutation($o:ID!,$t:String!,$r:ID!){createProjectV2(input:{ownerId:$o,title:$t,repositoryId:$r}){projectV2{id number url}}}',
        o=me['id'], t=TITLE, r=repo_id)['createProjectV2']['projectV2']
PID = p['id']
print('Project:', p['url'])
gql('mutation($p:ID!,$d:String!,$r:String!){updateProjectV2(input:{projectId:$p,shortDescription:$d,readme:$r}){projectV2{id}}}', p=PID,
    d='LAB-4 詳細設計からの分解（Epic→Task→Subtask、SP＋見積時間）', r='Sprint 1: 2026-10-05〜10-16。SP集計はタスク単位（サブタスクは内訳）。担当は仮名（BE1/BE2/FE1/QA1/BrSE）。')


def sel_field(name, opts):
    o = [{'name': x, 'color': 'GRAY', 'description': ''} for x in opts]
    f = gql('mutation($p:ID!,$n:String!,$o:[ProjectV2SingleSelectFieldOptionInput!]){createProjectV2Field(input:{projectId:$p,dataType:SINGLE_SELECT,name:$n,singleSelectOptions:$o}){projectV2Field{... on ProjectV2SingleSelectField{id options{id name}}}}}',
            p=PID, n=name, o=o)['createProjectV2Field']['projectV2Field']
    return f['id'], {x['name']: x['id'] for x in f['options']}


def num_field(name):
    return gql('mutation($p:ID!,$n:String!){createProjectV2Field(input:{projectId:$p,dataType:NUMBER,name:$n}){projectV2Field{... on ProjectV2Field{id}}}}',
               p=PID, n=name)['createProjectV2Field']['projectV2Field']['id']


F = {'sp': num_field('Story Points'), 'h': num_field('Estimate (h)'), 'act': num_field('Actual (h)')}
F['role'], O_ROLE = sel_field('担当（仮）', ['BE1', 'BE2', 'FE1', 'QA1', 'BrSE'])
F['sprint'], O_SPRINT = sel_field('Sprint', ['Sprint 1', 'Sprint 2', 'Sprint 3', 'Sprint 4'])
F['epic'], O_EPIC = sel_field('Epic', [e['id'] + ' ' + e['jp'] for e in B['epics']])
cons = sorted({t['constraint'] for t in B['tasks']})
F['con'], O_CON = sel_field('業務制約', cons)

# Status: thêm In Review / Blocked
st = gql('query($p:ID!){node(id:$p){... on ProjectV2{field(name:"Status"){... on ProjectV2SingleSelectField{id options{id name}}}}}}', p=PID)['node']['field']
want = [('Todo', 'GRAY'), ('In Progress', 'YELLOW'), ('In Review', 'BLUE'), ('Blocked', 'RED'), ('Done', 'GREEN')]
try:
    st = gql('mutation($f:ID!,$o:[ProjectV2SingleSelectFieldOptionInput!]){updateProjectV2Field(input:{fieldId:$f,singleSelectOptions:$o}){projectV2Field{... on ProjectV2SingleSelectField{id options{id name}}}}}',
             f=st['id'], o=[{'name': n, 'color': c, 'description': ''} for n, c in want])['updateProjectV2Field']['projectV2Field']
except SystemExit as e:
    print('WARN status update:', e)
F['status'] = st['id']; O_STATUS = {x['name']: x['id'] for x in st['options']}


def setf(item, field, value, kind):
    v = {'number': value} if kind == 'n' else {'singleSelectOptionId': value}
    gql('mutation($p:ID!,$i:ID!,$f:ID!,$v:ProjectV2FieldValue!){updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:$v}){projectV2Item{id}}}',
        p=PID, i=item, f=field, v=v)


def issue(title, body, labels, closed=False):
    r = call('POST', f'{REST}/issues', {'title': title, 'body': body, 'labels': labels})
    if closed:
        call('PATCH', f"{REST}/issues/{r['number']}", {'state': 'closed', 'state_reason': 'completed'})
    item = gql('mutation($p:ID!,$c:ID!){addProjectV2ItemById(input:{projectId:$p,contentId:$c}){item{id}}}', p=PID, c=r['node_id'])['addProjectV2ItemById']['item']['id']
    time.sleep(0.7)
    return r, item


def fill(item, t, epic_label):
    setf(item, F['sp'], t['sp'], 'n'); setf(item, F['h'], t['h'], 'n')
    if t.get('actual') is not None: setf(item, F['act'], t['actual'], 'n')
    setf(item, F['role'], O_ROLE[t['role']], 's'); setf(item, F['sprint'], O_SPRINT[t['sprint']], 's')
    setf(item, F['epic'], O_EPIC[epic_label], 's')
    if t['status'] in O_STATUS: setf(item, F['status'], O_STATUS[t['status']], 's')


EP = {}
for e in B['epics']:
    ts = [t for t in B['tasks'] if t['epic'] == e['id']]
    body = f"## {e['jp']}\n{e['vn']}\n\n- Tasks: {len(ts)} / SP 合計: {sum(t['sp'] for t in ts)} / 見積: {sum(t['h'] for t in ts)}h\n- 出典: LAB-4 詳細設計（Drive: LAB4_Wireframe_Architecture_DetailDesign_ThuAnh）"
    r, item = issue(f"[{e['id']}] {e['jp']}", body, ['type:epic'] + (['2024年問題'] if e['id'] == 'E7' else []))
    label = e['id'] + ' ' + e['jp']
    setf(item, F['epic'], O_EPIC[label], 's')
    setf(item, F['sp'], sum(t['sp'] for t in ts), 'n'); setf(item, F['h'], sum(t['h'] for t in ts), 'n')
    EP[e['id']] = (r, label)
    print('epic', e['id'], r['number'])

TK = {}
for t in B['tasks']:
    labels = ['type:task'] + (['業務制約'] if t['constraint'] != '—' else []) + (['2024年問題'] if t['epic'] == 'E7' else [])
    body = (f"**Epic:** #{EP[t['epic']][0]['number']}  |  **SP:** {t['sp']}  |  **見積:** {t['h']}h  |  **担当（仮）:** {t['role']}  |  **{t['sprint']}**\n\n"
            f"**業務制約:** {t['constraint']}\n**参照:** {t['ref']}\n\n### 内容 | Nội dung\n{t['vn']}\n\n### 受入条件 | Acceptance\n- [ ] {t['ac']}\n")
    r, item = issue(f"[{t['id']}] {t['title']}", body, labels, closed=t['status'] == 'Done')
    fill(item, t, EP[t['epic']][1])
    call('POST', f"{REST}/issues/{EP[t['epic']][0]['number']}/sub_issues", {'sub_issue_id': r['id']})
    TK[t['id']] = (r, t)
    print('task', t['id'], r['number'])

for s in B['subtasks']:
    pr, pt = TK[s['parent']]
    body = f"**親タスク:** #{pr['number']}  |  **SP:** {s['sp']}  |  **見積:** {s['h']}h  |  **担当（仮）:** {s['role']}\n\n※ SP 集計は親タスク単位（サブタスクは内訳）"
    r, item = issue(f"[{s['id']}] {s['title']}", body, ['type:subtask'] + (['2024年問題'] if pt['epic'] == 'E7' else []), closed=s['status'] == 'Done')
    fill(item, dict(s, constraint=pt['constraint']), EP[pt['epic']][1])
    call('POST', f"{REST}/issues/{pr['number']}/sub_issues", {'sub_issue_id': r['id']})
    print('subtask', s['id'], r['number'])

print('DONE', p['url'])
