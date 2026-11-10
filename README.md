# usage-band

Claude Code 입력창 위에 5시간/주간 사용량과 컨텍스트 사용률을 보여주는 배너입니다.
`/cs-on`으로 켜고 `/cs-off`로 끕니다.

막대 색은 5시간/주간은 50% 이상 주황, 80% 이상 빨강이고, 컨텍스트는 30% 이상 주황, 60% 이상 빨강입니다.
서브에이전트나 백그라운드 셸 명령이 돌면 배너 아래에 실행 시간과 함께 목록이 쌓이고, ▾/▴로 접고 펼칩니다.
오른쪽 끝의 세션 압축 버튼은 /compact와 같습니다. 응답 중에 누르면 '압축 대기 중'으로 바뀌고 응답이 끝나면 압축합니다(다시 누르면 취소).


<img width="789" height="139" alt="image" src="https://github.com/user-attachments/assets/374effa9-0393-485a-90b2-3559140fb3da" />




## 설치

**터미널 세션의 프롬프트에서:**

```
/plugin install usage-band --marketplace Hwasowl/claude-usage-ui
```

마켓플레이스를 추가할지 물으면 `y`를 누르고, 범위(scope)를 고르면 됩니다.

**셸에서:**

```
claude plugin install usage-band --marketplace Hwasowl/claude-usage-ui
```

**데스크톱 앱(`/plugin`이 동작하지 않는 곳):**

```
입력창 옆 + 버튼 → Plugins → Add marketplace에 `Hwasowl/claude-usage-ui` 입력 → Add plugin.
```
