# usage-band

Claude Code 입력창 위에 5시간/주간 사용량과 컨텍스트 사용률을 보여주는 배너입니다.
`/cs-on`으로 켜고 `/cs-off`로 끕니다.

막대 색은 기본으로 40% 이상 주황, 80% 이상 빨강입니다. 배너의 톱니(⚙)에 마우스를 올리면 5시간/주간/컨텍스트별로 기준을 바꿀 수 있습니다.

<img width="797" height="149" alt="image" src="https://github.com/user-attachments/assets/35f87b63-ffd3-41e7-8be7-f50969f26781" />


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
