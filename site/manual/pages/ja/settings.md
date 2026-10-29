# 設定

Meno の設定がどこにあり、それぞれの部分に何があるかを説明します。設定はこのコンピューターの Meno のもので、変えるとすぐに保たれます。

## 設定を開く {#opening}

ウィンドウの右上にある「Settings」ボタンで、設定が専用のタブに開きます。ほかのタブと同じように閉じられます。上に部分ごとのタブが並びます。「General」「Drawing」「3D」「Chemistry」「Files」「Calculations」「Plugins」「Dictionary」「Network」です。

## ワークスペースのスタイル {#workspace}

設定にある構造式のスタイルと 3D のスタイルは、新しいワークスペースが使い始めるものです。ワークスペースは、作られたときのスタイルを自分のファイルに保ちます。変えるには、そのページの何もないところを右クリックして「Styles…」を選びます。そこの「Use Settings' styles」で、設定のスタイルに戻せます。ワークスペースを開いている間に設定のスタイルが変わると、Meno が尋ねます（「Settings has a new style」）。「Keep its style」か「Apply to this workspace」を選びます。

## General {#general}

- 「The wheel turned upwards」：「Zooms in」か「Zooms out」。
- 「Drawing resolution」：ページをどれだけ細かく描くか。「2×」「Matching the screen」「1×」。
- 「Read labels as they are meant」と「Write words on the page as they are meant」：略記で打ったラベルや言葉が、その意味の形になります。
- 「Colours」：パレット。「Meno」「Okabe–Ito」か、「New set」で作る自分のセット。
- 「Say a workspace is large past」：保存のときに大きなワークスペースについて尋ねる大きさ。
- 「Meno's log」（「Open log folder」）と「Licences」。

## Drawing {#drawing}

「Drawing style」：新しいワークスペースの構造式のスタイルです。「Meno」「ACS 1996」「RSC」「Wiley」「Nature」か、それらから「Save as style…」で作る自分のスタイルを選びます。「Bond length」や「Line thickness」からラベル、矢印まで、どの部分も変えられます。「Find a setting」で項目を探せ、変えたところは元に戻せます。「Preview」に、いまのスタイルが見えます。

## 3D {#3d}

「Molecules in 3D」：新しいワークスペースで分子を見せるスタイル（「Primary」と「Secondary」）、それぞれのスタイルが分子をどう描くか（「Atoms」「Hydrogens on carbon」、鎖、面、線など）、「Atom colours」、そして「Every style」の下に、光、軌道と密度、リボン、回転があります。

## Chemistry {#chemistry}

- 「Point out atoms with too many bonds」：結合が多すぎる原子に、ページの上だけの印を付けます。
- Meno のためにどのプラグインが何をするか（「SMILES to a structure, and back」から「Pictures and films of molecules in 3D, rendered」まで）と、二つのプラグインができるときはそのどちらにするか。その指定は下に並びます。
- 「Keep conformers within」：最も低いものよりずっと高い配座は、作るときに外されます。

## Files {#files}

- Meno が開くファイルの種類ごとに、何が読み、何が書くかの表。
- 「Opening files」：Meno で開くようにできる形式と、「Use Meno」。
- 「Copied pictures」：「Resolution」。

## Calculations {#calculations}

- 計算のステップの種類ごとの、最初の指定です。それを走らせるもの（加えた各プラグインと Meno）ごとに並びます。ページに置いたステップはこの指定で始まり、ステップの中で変えた指定はそのステップだけのものです。
- 「Jobs」：「Cores for each job」「Cores jobs may use」「Memory jobs may use」、「Where jobs run」（「Choose…」でフォルダーを選ぶか「Meno's own」）、そして「Clear」の付いた「Finished jobs' files」。
- 「Procedures」：ページから「Save as procedure…」で保存したもので、「Rename」「Save as file…」「Remove」があります。

## Plugins {#plugins}

Meno が用意しているすべてのプラグインが、「Add」と「Remove」とともに並びます。詳しくはマニュアルのプラグインのページにあります。

## Dictionary {#dictionary}

それぞれのラベルが何を表すか（Boc、DMP、XPhos、Grubbs II など）を、構造で示します。

- 「Yours」：自分のラベル。「Add a label」で、ラベル、ほかの書き方、名前、そして付く位置を `*` で示した SMILES の構造を入れます。または、ページで基を選び、そのメニューの「Save as abbreviation…」を選びます。
- そのあとに Meno のもの：「Groups」「Reagents」「Ligands」「Buchwald precatalysts」「Counter-anions」。
- 「Find a label, name or SMILES」で、すべての中から探せます。

## Network {#network}

- 「Work offline」。
- 「Keep Meno up to date」と「Look now」（[インストール](installing#updates)）。
- 「Allowed」：ネットワークを使うことを許したもの。それぞれに「Withdraw」があります。
- 「Connections since Meno started」：すべての接続について、いつ、何のために、どこへ、どれだけやり取りしたか。
