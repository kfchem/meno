# 画像と動画

ページにあるものを画像にする方法と、3D 分子をレンダリングして画像や動画（回転、配座から配座へ、振動など）を作り、保存したりスライドで見せたりする方法です。

## ページの画像 {#of-the-page}

画像に入れたいものを選びます。⌘A（Windows では Ctrl+A）ですべてを選べます。そのあと、次のどちらかをします。

- コピーして（⌘C、または Ctrl+C）、Word や PowerPoint などに貼り付けます（[Word と PowerPoint へ](drawing#office)）。
- 右クリックして「Export…」を選び、「Export」カードで「SVG picture」を選んで「Export…」を押します。保存先は Meno がそのあと尋ねます（[ほかの形式で書き出す](files#export)）。

構造式は線の図として入ります。3D 分子は、ページに見えているとおりのピクセルの画像として入り、線の図にはなりません。その細かさは、設定の「Files」、「Copied pictures」の「Resolution」で決めます。「300 dpi」「600 dpi」「1200 dpi」から選びます。

## レンダリングに要るもの {#needs}

レンダリングは Blender プラグインが行います。macOS と Windows で動きます。設定の「Plugins」で加えてください。Meno はプラグインと、Meno 専用の Blender をダウンロードする前に、どこから、どのライセンスで、どのくらいの大きさかを示して尋ねます。「Allow and download」で用意されます（[加える](plugins#adding)）。ほかに自分でインストールするものはありません。

## レンダリングを頼む {#asking}

3D 分子を右クリックするか、3D 分子を含む選択を右クリックして、「Render…」を選びます。この項目は、レンダリングするプラグインを加えている間だけメニューに出ます。

ページの上に「Render」カードが開きます。いちばん上で「Picture」か「Film」を選びます。その下に、選ぶものが「Look」「Render」「Scene」、動画ならさらに「Motion」に分かれて並びます。「Render」を押すとレンダリングが始まります。閉じるには「Cancel」を押すか、Escape を押します。カードは、画像のときと動画のときで、それぞれ前に選んだものを覚えています。

## 見た目 {#look}

「Look」で、分子が何でできているように見せるかを決めます。「As the canvas draws them」か、Meno の見た目のどれかです。

- 「Lacquered: a clear coat over the element colours」
- 「Flat: no shine, in the element colours」
- 「Crystal: clear, tinted by the element colours」
- 「Anodised: metal in the element colours」
- 「Cartoon: one lit band, outlined」
- 「Line art: white fill, outlined」

これらを選ぶと、その下に、どんな見た目かが一行で出ます。

その下にたたまれた「Adjust this look」を開くと、見た目を作っている部分が出ます。このレンダリングに限って変えられます。「Molecules made of」、表面を見せているときは「Surfaces made of」、「Shading」、そして「Outlines」と、その「Outline width」「Outline colour」です。当てはまらない部分は出ません。

## 大きさ・背景・光 {#scene}

- 「Render」には、ピクセルで表す「Width」と、「Shape」（「Fitted to the molecules」「16:9」「4:3」「Square」）があります。続いてプラグインの選択肢、「Renderer」「Samples for each pixel」「Remove noise」「Render on」「Colours」が並びます。
- 「Scene」には「Background」があり、画像でも動画でも「Transparent」「White」「Black」「Grey」から選べます。続いて「Key light, against the canvas's」「Light all round, against the canvas's」「Shadows' softness」が並びます。

## 動画 {#films}

動画では、「Motion」に次のものがあります。

- 「Moving」：「Turning once round」、分子が複数のフレーム（たとえば配座）を持つときは「Through its frames」、計算の振動を分子に見せているときは「In the vibration shown」です。
- 「Once or Loop」：動きが最後に始めと同じ姿に戻るときに選べます。「Once: eases in and comes to rest」か「Loop: seamless, over and over」です。
- 「Length」：秒で表す長さです。動画は、その動きが見て取れる長さより短くはなりません。いちばん短い長さが、「At least 3 s」のように下に出ます。それより短くすると、その長さまで延ばされ、「Raised to 3 s, the shortest」のように出ます。
- 「Frames a second」：「24」「30」「60」から選びます。

「Render」にある「A film's quality」で、ファイルの大きさが変わります。設定の「Plugins」で「Film looks and motions」プラグインを加えると、加えている間、見た目と動きが増え、「Studio」も選べるようになります。

## レンダリングしている間 {#rendering}

結果が置かれる場所に、その大きさの破線の枠が出ます。場所は分子の右か、いちばん近い空いたところです。枠には進み具合（「Getting ready…」「Waiting for other jobs to finish…」「Rendering 37%…」など）が出て、止めるボタン（指すと「Stop rendering」と出ます）があります。枠をドラッグすると、結果を置く場所を変えられます。

うまくいかなかったときは、枠にその理由が出ます。ボタンは「Put away」に変わり、押すと枠が片付きます。ワークスペースのタブを閉じると、そのレンダリングは止まります。

## ページに置かれた結果 {#result}

画像は PNG として、動画は MP4 としてページに置かれます。動画はその場で、音なしで繰り返し再生されます。ほかの画像と同じように、動かしたり大きくしたりできます。

- 画像を右クリックすると「Save picture…」と「Copy picture」、動画を右クリックすると「Pause」か「Play」と「Save film…」があります。どちらも「Delete picture」で消えます。
- 「Transparent」でレンダリングした画像は、Meno の中でも、保存した PNG でも、透明なままです。
- 「Transparent」でレンダリングした動画は、ページでは下にあるものの上に重なって見えます。「Save film…」では「Film with transparency (QuickTime)」として保存されます。この動画を読めないプログラムもあります。ほかのプログラムのスライドに載せるときは、スライドの色を背景にしてレンダリングしてください。
- Meno のスライドでは、動画はそのスライドになったときに最初から再生され、クリックで止めたり続けたりできます（[発表する](slides#presenting)）。

## ワークフローの中の画像 {#step}

「Render」はワークフローのステップにもなります。何もないところをダブルクリックして「Calculations」を選び、「Blender」の下の「Render」を選びます（[ステップ](steps)）。3D 分子か配座を受け取り、それぞれの画像を作って、「Rendered」という名前のセットに入れます。作るのは画像だけで、動画は作りません。
