# usage-band

Claude Code 입력창 위에 5시간/주간 사용량과 컨텍스트 사용률을 보여주는 배너입니다.
`/cs-on`으로 켜고 `/cs-off`로 끕니다.

막대 색은 5시간/주간은 50% 이상 주황, 80% 이상 빨강이고, 컨텍스트는 30% 이상 주황, 60% 이상 빨강입니다.
서브에이전트가 돌면 배너 아래에 목록이 쌓이고, ▾/▴로 접고 펼칩니다.
답변 하나로 사용량이 늘면 퍼센트 옆에 +N%가 3초 동안 뜹니다.
오른쪽 끝의 세션 압축 버튼은 /compact와 같습니다.


<img width="785" height="144" alt="image" src="https://github.com/user-attachments/assets/e1604fd4-d004-4450-b092-28f1f841b015" />



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
