/**
 * 真实 ncm-cli 输出片段（2026-11-01 实测，已脱敏）。
 * 用例直接吃真实结构，避免「按脑补的 schema 写测试」。
 */

export const searchSongResponse = {
  code: 200,
  subCode: null,
  message: null,
  data: {
    recordCount: 288,
    records: [
      {
        originalId: 108965,
        id: 'AC34480C9320CE5652E2BCB41AEFA265',
        name: '冻结',
        duration: 289093,
        noCopyrightRcmd: null,
        artists: [{ originalId: 3684, id: 'FE87EFA5D8142B4F966DA711929BD130', name: '林俊杰' }],
        album: { originalId: 10808, id: '806969475196075BDE841027CD63EEDD', name: '乐行者' },
        coverImgUrl: 'http://p1.music.126.net/BU26yl8XSsV4g1_eYYTCWg==/109951172002804127.jpg',
      },
      {
        originalId: 150301,
        id: '9F1B6C0E5A0D4B7C8E9F0A1B2C3D4E5F',
        name: '冻结（Live）',
        duration: 271000,
        noCopyrightRcmd: { type: 1, typeDesc: '无版权' },
        artists: [{ name: '林俊杰' }],
        album: { name: 'Live' },
        coverImgUrl: 'http://p1.music.126.net/live.jpg',
      },
    ],
  },
}

export const playlistRadarResponse = {
  code: 200,
  data: [
    {
      originalId: 5300458264,
      id: '9C2708922E4E0E0B61EBB3598C81F381',
      name: '庄淇玟(29#)喊你来听新歌',
      coverImgUrl: 'http://p1.music.126.net/radar.jpg?imageView=1&thumbnail=800y800',
      describe: '你最爱的歌手 新鲜发行的作品 都在新歌雷达',
      creatorNickName: '云音乐私人雷达',
      playCount: 363998848,
      trackCount: 30,
    },
  ],
}

/** 含嵌套同名对象，用来验证「不会把 album/artist 误判成歌曲」 */
export const nestedTrapResponse = {
  code: 200,
  data: {
    songs: [
      {
        id: 'A'.repeat(32),
        name: '外层歌曲',
        duration: 200000,
        album: { id: 'B'.repeat(32), name: '专辑名' },
        artists: [{ id: 'C'.repeat(32), name: '歌手名' }],
      },
    ],
  },
}

export const lrcText = `[00:00.00]江南
[00:03.20]林俊杰
[00:12.40]风到这里就是黏
[01:02.10]爱有万分之一甜
[01:02.10]重复时间戳的行`

export const translationLrc = `[00:12.40]The wind is sticky here
[01:02.10]Love is one in ten thousand sweet`
