/**
 * متجهات اختبار ثابتة لفحص بصمة الجهاز ذاتياً (system.selftest). مفاتيح عامة وتوقيعات فقط، بلا أسرار.
 */
var WEBAUTHN_TEST_VECTORS_ = {
  'message': 'KMK portal WebAuthn self-test',
  'ec': {
    'publicKey': {
      'x': '705f3840f11ec1bdd2fb1125312ff8728dd443dbdc427b02ab68af0275091fff',
      'y': '993d568c40b98509f7aba1bf8a9674ecb5561badcf04b56ea3b5032142413e5a'
    },
    'sig': 'MEUCIQCcjSgqpzTWdzhkWohbs9p68KprRIHNxATF4ifYoA59zAIgLZVMfW9h8Tef9_PoyBmkMZeg_jEQO7ml2ao71cZ5-1M'
  },
  'rsa': {
    'publicKey': {
      'n': 'a30735a0e4fe0b26c2b6848e144d68e32dff034bd265af2698e92fc975d2b4139db1719b21d99f3dd0fdc5811c031fbf9ff93808d8fc555817dfa5f3f5b38ed9b501102f69e742f2fe7f6eff6f66e62b14a1b17f8e08cd931d4b8a4ebb5a198b40bf4d9207bec79d36f77b28bcf40cbb40b678eca15277e19148b5546a4a87d663d9e3c374dad46d08be78b3cf7320f309abed085bec9d76ab130660d2f49f3d0145dc1e9062bfb67a568192f96a00abba78fb3fab0adeb60ff8cee9b68b1a9cb0325f99eb67623c7c09a609d8be12c3008388dbc6536745242d42e33f1c3e3a79f14c4e8cad2afc5b802e67325027b90e72c61a6adbfd510cf2688a9a334899',
      'e': '010001'
    },
    'sig': 'NHA3XsKmiMuGm3FEjw7Qud7G10OlWx_kr92ZcFoNjr5eMDIX3J2eQx76q1byocwAZEYLEYuxDm6NDmZtfgZKhFes0ST8Ml5C9yTJkxKUdWlj-d7i01e0Yo4ufgNrVqlD_sGGbAhc6BpfEti7kV30SaWOnB9yV4FW_0b2JdjJC0bcu-oskGS_Qq9GPC29b_Wc3FWHOlQ_Pi4ZtS3bJXXTFIvbG4z0ukqsuePZCMvwP-0bWuVCVq35XXG0ZE1594gW4esoVbSmHLQxTMVC72GuyVSXtCgrmyrldU6ntjkblujuiMa4pxF1uECJxMZ6PtJp2tupR5KMlprZEJxNbQWssw'
  }
};
