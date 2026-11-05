# usage-band

Claude Code 입력창 위에 5시간/주간 사용량과 컨텍스트 사용률을 보여주는 배너입니다.
`/cs-on`으로 켜고 `/cs-off`로 끕니다.

막대 색은 5시간/주간은 50% 이상 주황, 80% 이상 빨강이고, 컨텍스트는 30% 이상 주황, 60% 이상 빨강입니다.
서브에이전트가 돌면 로봇 버튼 오른쪽 위에 개수가 뜨고, 배너 아래에 목록이 펼쳐집니다.

<img width="796" height="147" alt="image" src="https://github.com/user-attachments/assets/fa76990f-3f8b-43e4-a5fe-49c739ecf861" />

<img width="785" height="266" alt="image" src="https://github.com/user-attachments/assets/babc7772-7930-4fbe-91bb-5eacb2988462" />



## 설치

터미널 세션의 프롬프트에서:

```
/plugin install usage-band --marketplace Hwasowl/claude-usage-ui
```

마켓플레이스를 추가할지 물으면 `y`를 누르고, 범위(scope)를 고르면 됩니다.

셸에서:

```
claude plugin install usage-band --marketplace Hwasowl/claude-usage-ui
```

데스크톱 앱(`/plugin`이 동작하지 않는 곳): 입력창 옆 + 버튼 → Plugins → Add marketplace에 `Hwasowl/claude-usage-ui` 입력 → Add plugin.
