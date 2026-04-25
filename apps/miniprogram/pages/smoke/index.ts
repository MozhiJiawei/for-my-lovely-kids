Page({
  data: {
    ready: true,
  },

  onLoad() {
    wx.setNavigationBarTitle({
      title: "小红花花园",
    });
  },

  openReport() {
    wx.navigateTo({
      url: "/pages/e2e-report/index",
    });
  },
});
