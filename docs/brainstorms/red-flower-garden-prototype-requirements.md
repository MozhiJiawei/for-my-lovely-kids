---
date: 2026-04-25
topic: red-flower-garden-prototype
---

# Little Red Flower Garden Prototype

## Problem Frame

Build a WeChat Mini Program prototype for a 5-year-old child who should enjoy opening it every day. The child experience centers on a small garden and wish bubbles, while parents retain the minimum controls needed to configure tasks, confirm completed work, and approve red-flower redemptions.

The first version is an experience prototype for one family and one child. It should validate whether the child likes the daily loop and whether the parent confirmation flow is lightweight enough to use in real life.

---

## Actors

- A1. Child: Uses the garden tab, submits completed tasks, watches red flowers accumulate, and requests wish bubble redemption.
- A2. Parent: Enters the parent tab after verification, manages tasks and wishes, confirms submitted tasks, and approves redemptions.
- A3. Service: Stores all business data and is the source of truth for the mini program.

---

## Key Flows

- F1. Child submits a task
  - **Trigger:** The child finishes a visible task in the garden tab.
  - **Actors:** A1, A3
  - **Steps:** The child taps `我完成啦`; the task changes to `等家长看看`; no official red flowers are added yet; the submitted task appears in the parent confirmation list.
  - **Outcome:** The child gets immediate feedback, while official reward state waits for parent confirmation.
  - **Covered by:** R1, R3, R5, R9

- F2. Parent confirms tasks
  - **Trigger:** The parent opens the parent tab and passes verification.
  - **Actors:** A2, A3
  - **Steps:** The parent reviews pending task submissions, selects one or more, and confirms them in bulk.
  - **Outcome:** Confirmed tasks become official rewards; available red flowers increase; cumulative red flowers increase; the child task status becomes `开花啦`.
  - **Covered by:** R2, R5, R7, R9, R12, R13, R14

- F3. Child requests a wish
  - **Trigger:** A wish bubble has enough available red flowers.
  - **Actors:** A1, A2, A3
  - **Steps:** The child taps the lit wish bubble and submits a redemption request; the parent later approves it from the parent tab.
  - **Outcome:** Available red flowers decrease, cumulative red flowers do not decrease, and the garden gains one automatic memorial decoration.
  - **Covered by:** R4, R10, R13, R14, R16

---

## Requirements

**Child Garden Experience**
- R1. The mini program must default to a child-friendly garden tab with the garden shown above the task list.
- R2. The child garden tab must use child-friendly copy for task states: `我完成啦`, `等家长看看`, and `开花啦`.
- R3. The garden tab must show today's tasks below the garden, including both fixed daily tasks and today's temporary tasks.
- R4. The garden tab must show up to three active wish bubbles with progress toward each wish.
- R5. When the child submits a task, the task must enter a pending parent-confirmation state and must not immediately add official red flowers.
- R6. All user-facing mini program copy must be in Chinese.
- R7. The child garden must have high visual appeal for a 5-year-old and should use illustration-like visual assets for the main garden experience rather than relying on plain UI shapes alone.

**Parent Management**
- R8. The mini program must include a separate parent tab whose management content requires a fixed 4-digit parent passcode.
- R9. The parent tab must use tool-like, efficient management UI rather than child-themed copy or layout.
- R10. Parents must be able to batch-confirm pending task submissions.
- R11. Parents must be able to approve pending wish redemption requests.
- R12. Parents must be able to manage fixed daily tasks, add today's temporary tasks, and manage up to three active wish bubbles.

**Red Flower And Garden Rules**
- R13. The system must track available red flowers separately from cumulative red flowers.
- R14. Available red flowers must increase only after parent-confirmed tasks and must decrease after approved wish redemption.
- R15. Cumulative red flowers must increase after parent-confirmed tasks and must never decrease due to redemption.
- R16. The garden must grow from cumulative red flowers, not from current available balance.
- R17. Each approved wish redemption must automatically add one unified memorial decoration to the garden.
- R18. The prototype must not enforce a daily red-flower earning cap.

**Prototype Data And Access**
- R19. The mini program must not store business data such as tasks, wishes, red-flower balances, submissions, or redemption records on the phone.
- R20. All business data must be stored on a service that can be run from either Windows or macOS.
- R21. The prototype is for WeChat Mini Program development or experience-version use, not public release.
- R22. The service must be reachable from outside the home network because the target Mac mini may not be located at home.
- R23. The prototype should use a lightweight shared access mechanism suitable for an experience version, while deferring full account, family invitation, and WeChat-login systems.

---

## Acceptance Examples

- AE1. **Covers R5, R10, R13, R14, R15.** Given a task worth 2 red flowers, when the child taps `我完成啦`, the task shows `等家长看看` and balances do not change; when the parent batch-confirms it, available red flowers and cumulative red flowers both increase by 2.
- AE2. **Covers R4, R11, R14, R15, R17.** Given a wish bubble costs 10 red flowers and the child has 12 available red flowers, when the child requests the wish and the parent approves it, available red flowers become 2, cumulative red flowers stay unchanged, and the garden receives one memorial decoration.
- AE3. **Covers R1, R3.** Given the child opens the mini program, the first visible experience is the garden area; today's task list appears below it.
- AE4. **Covers R8, R9, R12.** Given the child taps the parent tab, management controls are not visible until the 4-digit passcode is entered.

---

## Success Criteria

- The child understands the basic loop without adult explanation after a few uses: complete task, wait for parent, see flowers grow, move closer to wishes.
- The parent can confirm a day's submitted tasks quickly enough that the confirmation step does not become a chore.
- The prototype supports real family use across devices because business data lives on the service, not on one phone.
- The requirements are clear enough for planning to proceed without inventing product behavior around rewards, task states, wishes, or parent confirmation.

---

## Scope Boundaries

- One family and one child only.
- No complete public-user account system in the prototype.
- No WeChat login in the prototype.
- No family invitation or multi-parent role management.
- No full calendar, month view, trend chart, or weekly report.
- No task photo proof or voice proof.
- No extra parent-awarded bonus flowers during confirmation.
- No red-flower deduction as punishment.
- No redemption history list beyond what is needed to keep garden state correct.
- No child-selected decorations; each approved redemption creates the same kind of memorial decoration.
- No complex audit log, undo confirmation, or rollback flow.
- No daily red-flower earning cap.

---

## Key Decisions

- Garden plus wish bubbles: The garden gives daily emotional feedback, while wish bubbles provide a visible goal.
- High-quality garden visuals matter: The garden is a core child-attraction surface, so implementation planning should choose the rendering approach by visual result, not by assuming plain UI shapes are sufficient.
- Garden above tasks: The first impression should be delight and progress, not a task manager.
- Parent confirmation before official reward: The child gets immediate acknowledgement, but reward state stays trustworthy.
- Available flowers and cumulative flowers are separate: Redemption should not make the garden feel smaller or erase past effort.
- Parent tab uses passcode verification: It protects management actions without introducing a full account system.
- Child side is playful, parent side is tool-like: Each actor gets the interface language that fits their job.
- Prototype experience version first: The product should be validated with the family before expanding toward public release.
- Service is the source of truth: Phone-side business storage is intentionally avoided because the app should work across devices.

---

## Dependencies / Assumptions

- The WeChat Mini Program will be used as a development or experience version before any public release.
- A reachable HTTPS service domain will be needed for realistic phone testing outside the home network.
- The service must remain easy to run on both Windows and macOS so development can happen on Windows and deployment can later move to Mac mini.
- The first real user is a 5-year-old child, so copy, layout, and feedback should be optimized for that age.

---

## Outstanding Questions

### Resolve Before Planning

- None.

### Deferred to Planning

- [Affects R20, R22][Technical] Choose the exact service runtime, persistence approach, and deployment path that best support Windows development and Mac mini hosting.
- [Affects R22, R23][Technical] Decide how the experience-version service is exposed securely over the public internet.
- [Affects R23][Technical] Define the lightweight shared access mechanism for the experience version.
- [Affects R7, R16, R17][Product/design] Define the first garden growth thresholds, visual assets, rendering approach, and the visual form of the unified memorial decoration.

---

## Next Steps

-> `/ce-plan` for structured implementation planning.
