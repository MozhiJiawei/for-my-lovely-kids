import {
  hasParentPasscode,
  isParentControlUnlocked,
  isValidParentPasscode,
  saveParentPasscode,
  validateParentPasscode,
} from "../../src/parent-control";

type ParentControlMode = "setup" | "confirmSetup" | "unlock";

const passcodeKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "cancel", "0", "delete"];
const passcodeSlots = [0, 1, 2, 3, 4, 5];

let resolveParentControl: ((allowed: boolean) => void) | null = null;
let setupPasscodeDraft = "";

function titleForMode(mode: ParentControlMode): string {
  if (mode === "setup") {
    return "设置家长密码";
  }

  if (mode === "confirmSetup") {
    return "再输入一次";
  }

  return "家长确认";
}

Component({
  data: {
    visible: false,
    mode: "unlock" as ParentControlMode,
    title: "家长确认",
    subtitle: "输入 6 位数字，家长权限会保留 10 分钟。",
    passcodeDigits: "",
    passcodeError: "",
    passcodeKeys,
    passcodeSlots,
  },

  methods: {
    request(reason: string): Promise<boolean> {
      if (isParentControlUnlocked()) {
        return Promise.resolve(true);
      }

      if (resolveParentControl) {
        resolveParentControl(false);
      }

      setupPasscodeDraft = "";
      const mode: ParentControlMode = hasParentPasscode() ? "unlock" : "setup";
      this.setData({
        visible: true,
        mode,
        title: titleForMode(mode),
        subtitle: reason,
        passcodeDigits: "",
        passcodeError: mode === "setup" ? "请设置 6 位家长密码。" : "",
      });

      return new Promise((resolve) => {
        resolveParentControl = resolve;
      });
    },

    tapPasscodeKey(event: WechatMiniprogram.TouchEvent) {
      const key = String(event.currentTarget.dataset.key ?? "");

      if (key === "cancel") {
        this.cancel();
        return;
      }

      if (key === "delete") {
        this.setData({
          passcodeDigits: this.data.passcodeDigits.slice(0, -1),
          passcodeError: "",
        });
        return;
      }

      if (!/^\d$/.test(key) || this.data.passcodeDigits.length >= 6) {
        return;
      }

      const passcodeDigits = `${this.data.passcodeDigits}${key}`;
      this.setData({
        passcodeDigits,
        passcodeError: "",
      });

      if (passcodeDigits.length === 6) {
        this.handlePasscodeComplete(passcodeDigits);
      }
    },

    handlePasscodeComplete(passcode: string) {
      if (!isValidParentPasscode(passcode)) {
        this.setData({
          passcodeDigits: "",
          passcodeError: "请输入 6 位数字。",
        });
        return;
      }

      if (this.data.mode === "setup") {
        setupPasscodeDraft = passcode;
        const mode: ParentControlMode = "confirmSetup";
        this.setData({
          mode,
          title: titleForMode(mode),
          passcodeDigits: "",
          passcodeError: "再输入一次，确认家长密码。",
        });
        return;
      }

      if (this.data.mode === "confirmSetup") {
        if (passcode !== setupPasscodeDraft) {
          const mode: ParentControlMode = "setup";
          setupPasscodeDraft = "";
          this.setData({
            mode,
            title: titleForMode(mode),
            passcodeDigits: "",
            passcodeError: "两次输入不一致，请重新设置。",
          });
          return;
        }

        saveParentPasscode(passcode);
        this.finish(true);
        return;
      }

      if (!validateParentPasscode(passcode)) {
        this.setData({
          passcodeDigits: "",
          passcodeError: "密码不对，请再试一次。",
        });
        return;
      }

      this.finish(true);
    },

    cancel() {
      this.finish(false);
    },

    finish(allowed: boolean) {
      setupPasscodeDraft = "";
      const resolve = resolveParentControl;
      resolveParentControl = null;
      this.setData({
        visible: false,
        passcodeDigits: "",
        passcodeError: "",
      });
      resolve?.(allowed);
    },

    noop() {
      return;
    },
  },
});
